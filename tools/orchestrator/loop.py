#!/usr/bin/env python3
"""
Stellarc orchestrator loop (owner: Talos). Runs every 10 min via systemd timer.

Multica (NevrLabs workspace, project "Stellarc v2 — agent-native") is the
system of record. This loop is mechanical and idempotent; every action is
recorded as a Multica comment and in ~/.stellarc-orchestrator/state.json.

State machine per work issue (Builder/Designer):
  todo/in_progress  → agents work
  in_review         → spawn a Reviewer issue (once) linked to it
  review PASS       → if PR CI green: squash-merge into the issue's base;
                      mark work issue done
  review REWORK     → move work issue back to todo with the defect list
                      (cycle += 1; cycle > 3 → blocked + escalate to Talos)
  blocked           → escalate to the Talos (hermes) agent once
Design issues skip auto-merge: they wait for the operator's review label.

Pipeline feeders (keep the queue full, bounded by WIP limits):
  - when the effect/v4 port issues are all done and effect/v4 is green →
    open PR effect/v4 → dev and file the M1 group-migration issues
  - M1 groups are filed from ROADMAP order, at most WIP_BUILD open at once
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

WS_PROFILE = "nevrlabs"
PROJECT = "079971ed-f25c-428d-92c9-f174fe50547b"
REPO = "NevrLabs/stellarc"
BUILDER = "Stellarc Builder"
REVIEWER = "Stellarc Reviewer"
DESIGNER = "Stellarc Designer"
TALOS = "Talos (hermes)"
WIP_BUILD = int(os.environ.get("STELLARC_WIP_BUILD", "4"))
MAX_CYCLES = 3
STATE = Path.home() / ".stellarc-orchestrator" / "state.json"
LOG = Path.home() / ".stellarc-orchestrator" / "loop.log"
DRY = "--dry-run" in sys.argv

M1_GROUPS = [
    ("milestone", "packages/kaneo-legacy/src/milestone"),
    ("flag", "packages/kaneo-legacy/src/flag"),
    ("task-relation", "packages/kaneo-legacy/src/task-relation"),
    ("external-link", "packages/kaneo-legacy/src/external-link"),
    ("time-entry", "packages/kaneo-legacy/src/time-entry"),
    ("comment", "packages/kaneo-legacy/src/comment"),
    ("activity", "packages/kaneo-legacy/src/activity"),
    ("notification", "packages/kaneo-legacy/src/notification"),
    ("notification-preferences", "packages/kaneo-legacy/src/notification-preferences"),
    ("workflow-rule", "packages/kaneo-legacy/src/workflow-rule"),
    ("task-template", "packages/kaneo-legacy/src/task-template"),
    ("team", "packages/kaneo-legacy/src/team"),
    ("invitation", "packages/kaneo-legacy/src/invitation"),
    ("user", "packages/kaneo-legacy/src/user"),
    ("organization", "packages/kaneo-legacy/src/organization"),
    ("resource-grant", "packages/kaneo-legacy/src/resource-grant"),
    ("search", "packages/kaneo-legacy/src/search"),
    ("data-table", "packages/kaneo-legacy/src/data-table"),
    ("project", "packages/kaneo-legacy/src/project"),
]


def log(msg: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {msg}"
    print(line)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def sh(cmd: list[str], check: bool = True, timeout: int = 120) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:4])}…: {r.stderr.strip()[:400]}")
    return r.stdout


def mc(*args: str, check: bool = True) -> str:
    return sh(["multica", "--profile", WS_PROFILE, *args], check=check)


def mcj(*args: str):
    return json.loads(mc(*args, "--output", "json"))


def load_state() -> dict:
    if STATE.exists():
        try:
            return json.loads(STATE.read_text())
        except json.JSONDecodeError:
            bak = STATE.with_suffix(".bak")
            if bak.exists():
                return json.loads(bak.read_text())
    return {"reviews": {}, "cycles": {}, "merged": [], "escalated": [], "filed_groups": []}


def save_state(s: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, indent=2))
    if STATE.exists():
        STATE.replace(STATE.with_suffix(".bak"))
    tmp.replace(STATE)


def issues() -> list[dict]:
    acc: list[dict] = []
    offset = 0
    while True:
        out = mcj("issue", "list", "--project", PROJECT, "--limit", "100", "--offset", str(offset))
        page = out.get("issues", []) if isinstance(out, dict) else out
        acc.extend(page)
        if not (isinstance(out, dict) and out.get("has_more")):
            return acc
        offset += 100


def comments(key: str) -> list[dict]:
    try:
        out = mcj("issue", "comment", "list", key)
        return out if isinstance(out, list) else out.get("comments", [])
    except Exception:
        return []


def comment(key: str, body: str) -> None:
    if DRY:
        log(f"DRY comment {key}: {body[:80]}")
        return
    mc("issue", "comment", "add", key, "--content", body, check=False)


_AGENTS: dict[str, str] = {}


def assignee_name(i: dict) -> str:
    if not _AGENTS:
        for a in mcj("agent", "list"):
            _AGENTS[a["id"]] = a["name"]
    return _AGENTS.get(i.get("assignee_id") or "", "")


def key_of(i: dict) -> str:
    return i.get("identifier") or i.get("key") or i["id"]


PR_RE = re.compile(r"https://github\.com/NevrLabs/stellarc/pull/(\d+)")


def pr_of(key: str) -> int | None:
    for c in reversed(comments(key)):
        m = PR_RE.search(c.get("content", "") or "")
        if m:
            return int(m.group(1))
    return None


def pr_state(n: int) -> dict:
    return json.loads(
        sh(["gh", "pr", "view", str(n), "-R", REPO, "--json",
            "state,baseRefName,headRefName,mergeable,statusCheckRollup,title"])
    )


REQUIRED_CHECKS = {"foundation", "ui-purity"}


def checks_green(pr: dict) -> tuple[bool, str]:
    seen = {}
    for c in pr.get("statusCheckRollup") or []:
        seen[c.get("name")] = (c.get("conclusion") or c.get("status") or "").upper()
    missing = [n for n in REQUIRED_CHECKS if n not in seen]
    if missing:
        return False, f"checks not reported yet: {missing}"
    bad = {n: v for n, v in seen.items() if n in REQUIRED_CHECKS and v != "SUCCESS"}
    return (not bad), (f"required checks: {bad}" if bad else "green")


def verdict(review_key: str) -> tuple[str | None, str]:
    for c in reversed(comments(review_key)):
        body = c.get("content", "") or ""
        m = re.search(r"VERDICT:\s*(PASS|REWORK)", body)
        if m:
            return m.group(1), body
    return None, ""


def create_issue(title: str, assignee: str, desc: str, priority: str = "high") -> str:
    if DRY:
        log(f"DRY create {assignee}: {title}")
        return "DRY-0"
    d = mcj("issue", "create", "--project", PROJECT, "--assignee", assignee,
            "--priority", priority, "--title", title, "--description", desc)
    return key_of(d)


def set_status(key: str, status: str, assignee: str | None = None, no_start: bool = False) -> None:
    if DRY:
        log(f"DRY status {key} → {status}")
        return
    args = ["issue", "update", key, "--status", status]
    if assignee:
        args += ["--assignee", assignee]
    if no_start:
        args.append("--no-start")
    mc(*args, check=False)


def is_design(i: dict) -> bool:
    return (i.get("title") or "").startswith("Design:")


def step(state: dict) -> None:
    all_issues = issues()
    by_key = {key_of(i): i for i in all_issues}
    reviews = state["reviews"]  # work_key -> review_key

    # 1. in_review work issues → reviewer
    for i in all_issues:
        k, st, who = key_of(i), i.get("status"), assignee_name(i)
        if who not in (BUILDER, DESIGNER) or st != "in_review" or k in reviews:
            continue
        if who == DESIGNER and state["cycles"].get(k, 0) >= 1 and k in state.get("design_ready", []):
            continue
        pr = pr_of(k)
        if not pr:
            comment(k, "Orchestrator: status is in_review but no PR URL was found in the comments. Comment the PR URL and set the status to in_review again.")
            set_status(k, "todo", no_start=True)
            continue
        if who == DESIGNER:
            rk = create_issue(
                f"Design review {k}: PR #{pr}", REVIEWER,
                f"Design review for **{k}** ({i.get('title')}): https://github.com/{REPO}/pull/{pr}\n\n"
                "You are reviewing a product design mockup, not code. Check out the PR and look at every screenshot in its "
                "`docs/design/agents/<slug>/` folder. Use your vision tool on each PNG if you have one; otherwise open "
                "index.html and read the DOM and states. Critique it as a senior product designer against docs/ROADMAP.md "
                "and ADR 0011: hierarchy, density, Linear-like consistency, state coverage (empty, loading, error, offline, "
                "long content), whether it helps the user decide, single canonical flows, accessibility (colour-only signals, "
                "contrast), and fidelity to the real data model (packages/agents/src/protocol.ts). Start your comment with "
                "`VERDICT: PASS` (ready for the operator) or `VERDICT: REWORK`, followed by numbered, concrete fixes. "
                "Do not edit files.")
            reviews[k] = rk
            comment(k, f"Orchestrator: design review dispatched as {rk} (PR #{pr}).")
            log(f"design-review {k} → {rk}")
            continue
        rk = create_issue(
            f"Review {k}: PR #{pr}", REVIEWER,
            f"Review the implementation issue **{k}** ({i.get('title')}): "
            f"https://github.com/{REPO}/pull/{pr}\n\n"
            f"Read {k}'s description and comments for the brief and the claimed evidence. "
            "Follow your Reviewer instructions exactly. Start your comment with `VERDICT: PASS` or `VERDICT: REWORK`.")
        reviews[k] = rk
        comment(k, f"Orchestrator: review dispatched as {rk} (PR #{pr}).")
        log(f"review {k} → {rk} (PR #{pr})")

    # 2. verdicts
    for k, rk in list(reviews.items()):
        r = by_key.get(rk)
        if not r or r.get("status") not in ("in_review", "done"):
            continue
        v, body = verdict(rk)
        if not v:
            continue
        work = by_key.get(k)
        if v == "PASS" and work and assignee_name(work) == DESIGNER:
            pr = pr_of(k)
            state.setdefault("design_ready", []).append(k)
            set_status(rk, "done", no_start=True)
            set_status(k, "in_review", no_start=True)
            comment(k, f"Orchestrator: design review PASS. PR #{pr} is waiting on the operator; design PRs are never auto-merged.")
            create_issue(f"Operator: review design {k} (PR #{pr})", TALOS,
                f"Design {k} passed agent review. Talos: post the screenshots to the operator for a decision. "
                f"PR: https://github.com/{REPO}/pull/{pr}. Do NOT merge until the operator approves.", "medium")
            del reviews[k]
            log(f"design ready {k} #{pr}")
            continue
        if v == "PASS":
            pr = pr_of(k)
            if not pr:
                continue
            p = pr_state(pr)
            if p["state"] == "MERGED":
                pass
            else:
                ok, why = checks_green(p)
                if not ok:
                    log(f"{k} PASS but CI not green ({why}); waiting")
                    continue
                if DRY:
                    log(f"DRY merge #{pr}")
                else:
                    sh(["gh", "pr", "merge", str(pr), "-R", REPO, "--squash", "--delete-branch"], check=False)
                    p = pr_state(pr)
                    if p["state"] != "MERGED":
                        comment(k, f"Orchestrator: review PASSED but the merge of #{pr} failed (mergeable={p.get('mergeable')}). Rebase on `{p['baseRefName']}` and push.")
                        set_status(k, "todo")
                        del reviews[k]
                        continue
            state["merged"].append(pr)
            set_status(k, "done", no_start=True)
            set_status(rk, "done", no_start=True)
            comment(k, f"Orchestrator: review PASS → PR #{pr} merged into `{p['baseRefName']}`.")
            log(f"merged #{pr} for {k}")
            del reviews[k]
        else:
            cyc = state["cycles"].get(k, 0) + 1
            state["cycles"][k] = cyc
            set_status(rk, "done", no_start=True)
            del reviews[k]
            if cyc > MAX_CYCLES:
                set_status(k, "blocked", no_start=True)
                comment(k, f"Orchestrator: REWORK cycle {cyc} > {MAX_CYCLES}. Blocked and escalated to Talos.")
                escalate(state, k, f"{k} exceeded {MAX_CYCLES} rework cycles. Last review: {rk}.")
            else:
                comment(k, f"Orchestrator: REWORK (cycle {cyc}/{MAX_CYCLES}) from {rk}. Fix every numbered defect below on the SAME branch, push, then set status in_review.\n\n{body[:6000]}")
                set_status(k, "todo")
            log(f"rework {k} cycle {cyc}")

    # 2b. stalled runs: issue still todo/in_progress for an agent, but its latest
    # run ended (completed/failed) without the agent moving it to in_review.
    # Re-run with a nudge; give up after 3 nudges (→ blocked → escalate).
    for i in all_issues:
        k, st, who = key_of(i), i.get("status"), assignee_name(i)
        if who not in (BUILDER, DESIGNER, REVIEWER) or st not in ("todo", "in_progress"):
            continue
        try:
            runs = mcj("issue", "runs", k)
            runs = runs if isinstance(runs, list) else runs.get("runs", runs.get("tasks", []))
        except Exception:
            continue
        if not runs:
            continue
        latest = runs[0]
        if latest.get("status") in ("queued", "running", "claimed", "dispatched"):
            continue
        nudges = state.setdefault("nudges", {})
        n = nudges.get(k, 0)
        if latest.get("id") == state.setdefault("nudged_run", {}).get(k):
            continue  # already nudged this exact run; wait for the new one
        if n >= 3:
            set_status(k, "blocked", no_start=True)
            escalate(state, k, f"{k} stalled: {n} runs ended without reaching in_review.")
            continue
        nudges[k] = n + 1
        state["nudged_run"][k] = latest.get("id")
        comment(k, f"Orchestrator: your last run ({latest.get('status')}) ended but the issue is still `{st}`. "
                   "Continue from where you stopped: your worktree and branch are preserved. Finish the brief, "
                   "comment the PR URL and evidence, then set the status to in_review. If you are blocked, set it to blocked with the reason.")
        if not DRY:
            mc("issue", "rerun", k, check=False)
        log(f"nudged {k} ({n + 1}/3) after run {latest.get('status')}")

    # 3. blocked → escalate once
    for i in all_issues:
        k = key_of(i)
        if i.get("status") == "blocked" and assignee_name(i) in (BUILDER, DESIGNER, REVIEWER):
            escalate(state, k, f"{k} ({i.get('title')}) is blocked. Read its comments and unblock it: decide, re-scope, or reassign.")

    # 4. feeder: M1 groups once the effect/v4 port is merged into dev
    v4_open = [i for i in all_issues if (i.get("title") or "").startswith("Effect v4 port:") and i.get("status") != "done"]
    open_build = [i for i in all_issues if assignee_name(i) == BUILDER and i.get("status") in ("todo", "in_progress", "in_review")]
    if not v4_open and state.get("v4_merged_to_dev") and state.get("disk_ok", True):
        for group, src in M1_GROUPS:
            if len(open_build) >= WIP_BUILD:
                break
            if group in state["filed_groups"]:
                continue
            k = create_issue(f"M1: migrate `{group}` to Effect-native", BUILDER, m1_brief(group, src))
            state["filed_groups"].append(group)
            open_build.append({"identifier": k})
            log(f"filed M1 {group} → {k}")


def escalate(state: dict, key: str, why: str) -> None:
    if key in state["escalated"]:
        return
    state["escalated"].append(key)
    create_issue(f"Talos: unblock {key}", TALOS, why + "\n\nYou are the product owner. Resolve this: decide, rewrite the brief, or cancel it. Then comment and close this issue.", "urgent")
    log(f"escalated {key}")


def m1_brief(group: str, src: str) -> str:
    return f"""**M1: migrate the `{group}` API group from the lifted Kaneo tree to Effect-native.**

Base branch: `dev`. Legacy source: `{src}/` (the route file `index.ts` plus its `controllers/`).

Steps (this is the established pattern; read ADR 0012 and copy `packages/kaneo/src/labels.ts` exactly):
1. Declare every route of the group in `packages/kaneo/src/groups.ts` as an `HttpApiGroup` with the SAME paths, methods, payload and query fields as the legacy valibot validators, `success: Json`, `error: DomainErrors`. Add it to `KaneoApi` in `api.ts`.
2. Implement the handlers in `packages/kaneo/src/{group}.ts` with `HttpApiBuilder.group(KaneoApi, "...", ...)`, `Db` (drizzle-effect), `Access` (port the exact organizationAccess.* and requireOrganizationPermission(...) used by each legacy route, adding guards to Access if needed), and `DomainEvents` for every `publishEvent` (extend `DomainPorts` and `stellarc-auth.ts` `domainPorts` if new side effects such as notifications or integrations are needed). Port each controller's logic line by line, with the same status codes and messages.
3. Register the layer in `packages/kaneo/src/http.ts`.
4. Parity: extend `packages/kaneo/test/parity.ts` with steps covering EVERY route of the group, including error cases (missing id, wrong org, bad body), and fix the expected count in `tests/bun/kaneo-parity.test.ts`. K1 (admin) and K2 (member) must both pass. If the group publishes events, add a WebSocket or notification side-effect test like K3.
5. Negative control: sabotage one permission check in your handlers, show parity goes red, then revert.
6. Gates: `bun run lint && bun run typecheck && bun test tests/bun`. Push and open a PR to dev titled `M1({group}): Effect-native {group} group`.
Do NOT delete legacy code (a separate cleanup does that after all groups land)."""


def disk_guard() -> bool:
    """Pause the feeder (and warn) when Talos's root disk is low."""
    import shutil
    free_gb = shutil.disk_usage("/").free / 1e9
    if free_gb < 3:
        log(f"DISK LOW: {free_gb:.1f}G free on / — feeder paused; cleaning finished worktrees")
        for d in Path("/mnt/deepvault/wt").glob("*") if Path("/mnt/deepvault/wt").exists() else []:
            pass
        return False
    return True


def main() -> int:
    state = load_state()
    state["disk_ok"] = disk_guard()
    try:
        step(state)
    except Exception as e:  # noqa: BLE001
        log(f"ERROR {type(e).__name__}: {e}")
        save_state(state)
        return 1
    save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
