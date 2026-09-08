#!/usr/bin/env python3
"""forge — staged development workflow orchestrator over Paseo + GitHub.

One ticket, six gated stages, one state file, GitHub as the ledger.

  triage ──► spec ──► implement ──► review ──► merge-gate ──► merged
                        ▲             │
                        └── rework ───┘   (max 3 cycles, then escalate)

Every stage transition is recorded in <repo>/.forge/<TICKET>.json and mirrored
as a GitHub issue comment. Paseo runs the agents in isolated worktrees; forge
never runs an agent in the main checkout. The merge gate is the ONLY stage that
touches the target branch, and it runs the gates itself in a fresh worktree at
the PR head — it does not trust any agent's green.

Usage:
  forge init                                   write .forge/config.json for this repo
  forge triage   <issue#>                      dispatch triage agent → verdict comment + label
  forge spec     <issue#>                      dispatch spec-review agent → .forge/<T>.spec.md
  forge implement <issue#> [--cycle N]         dispatch implementer in a Paseo worktree → PR
  forge review   <issue#>                      dispatch adversarial reviewer (different family) on the PR diff
  forge merge    <issue#>                      orchestrator merge gate: fresh worktree, full gates, squash-merge
  forge status   [<issue#>]                    stage table for one or all tickets
  forge drain                                  print unread pipeline escalations

Config (.forge/config.json): repo, base branch, gate commands, model roster,
tracker. Models are gateway ids VERBATIM; implementer and reviewer families
must differ (enforced).
"""
from __future__ import annotations
import json, os, re, shlex, subprocess, sys, time, datetime as dt
from pathlib import Path

HOME = Path.home()
PASEO = HOME / ".local/node/bin/paseo"
PASEO_ENV = HOME / ".paseo-env"
PIPELINE = HOME / ".local/bin/kaneo-pipeline"

STAGES = ["triage", "spec", "implement", "review", "merge-gate", "merged"]
MAX_CYCLES = 3

# ── util ─────────────────────────────────────────────────────────────────────
def die(msg, code=1):
    print(f"forge: {msg}", file=sys.stderr); sys.exit(code)

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def sh(cmd, cwd=None, env=None, check=True, capture=True, timeout=600):
    r = subprocess.run(cmd, cwd=cwd, env=env, shell=isinstance(cmd, str),
                       capture_output=capture, text=True, timeout=timeout)
    if check and r.returncode:
        die(f"command failed ({r.returncode}): {cmd if isinstance(cmd,str) else ' '.join(cmd)}\n{(r.stderr or r.stdout)[-1500:]}")
    return r

def paseo_env():
    env = dict(os.environ)
    env["PATH"] = f"{HOME}/.local/node/bin:{HOME}/.local/bin:{env.get('PATH','')}"
    if PASEO_ENV.exists():
        for line in PASEO_ENV.read_text().splitlines():
            line = line.strip().removeprefix("export ").strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1); env[k] = v.strip().strip('"').strip("'")
    return env

def repo_root():
    r = sh(["git", "rev-parse", "--show-toplevel"], check=False)
    if r.returncode: die("not inside a git repo")
    return Path(r.stdout.strip())

def cfg():
    p = repo_root() / ".forge/config.json"
    if not p.exists(): die("no .forge/config.json — run `forge init`")
    return json.loads(p.read_text())

def state_path(t): return repo_root() / f".forge/{t}.json"
def spec_path(t):  return repo_root() / f".forge/{t}.spec.md"
def review_path(t, c): return repo_root() / f".forge/{t}.review-{c}.md"

def load_state(t):
    p = state_path(t)
    return json.loads(p.read_text()) if p.exists() else {"ticket": t, "stages": [], "cycle": 0}

def save_state(t, s):
    state_path(t).parent.mkdir(exist_ok=True)
    state_path(t).write_text(json.dumps(s, indent=1) + "\n")

def stage_status(s, stage):
    for st in reversed(s["stages"]):
        if st["stage"] == stage: return st["status"]
    return None

def record(t, stage, status, **extra):
    s = load_state(t)
    s["stages"].append({"stage": stage, "status": status, "at": now(), **extra})
    save_state(t, s)
    return s

def gate(t, needs):
    """Refuse to start a stage unless its predecessor passed."""
    st = stage_status(load_state(t), needs)
    if st != "pass":
        die(f"gate: {needs} is '{st}', not 'pass' — cannot proceed. Fix the predecessor or `forge status {t}`.")

def family(model_id):
    m = model_id.lower()
    for k in ("gpt", "claude", "glm", "deepseek", "minimax", "gemini", "qwen", "kimi"):
        if k in m: return k
    return m.split("/")[0]

# ── github ───────────────────────────────────────────────────────────────────
def gh(args, repo, capture=True):
    return sh(["gh"] + args + ["-R", repo], capture=capture)

def issue(n, repo):
    return json.loads(gh(["issue", "view", str(n), "--json", "number,title,body,labels,state,url"], repo).stdout)

def comment(n, repo, body):
    gh(["issue", "comment", str(n), "--body", body], repo)

def label(n, repo, add=None, remove=None):
    a = ["issue", "edit", str(n)]
    if add: a += ["--add-label", add]
    if remove: a += ["--remove-label", remove]
    gh(a, repo, capture=True)

def ensure_labels(repo):
    have = {l["name"] for l in json.loads(gh(["label", "list", "--json", "name", "--limit", "200"], repo).stdout)}
    want = {f"forge:{s}" for s in STAGES} | {"forge:rework", "forge:blocked", "forge:rejected"}
    for l in want - have:
        gh(["label", "create", l, "--color", "5319e7", "--force"], repo, capture=True)

def set_stage_label(n, repo, stage):
    for s in STAGES + ["rework", "blocked", "rejected"]:
        label(n, repo, remove=f"forge:{s}")
    label(n, repo, add=f"forge:{stage}")

# ── paseo ────────────────────────────────────────────────────────────────────
def dispatch(title, brief, model, cwd=None, worktree=None, base=None, branch=None, extra=None):
    env = paseo_env()
    cmd = [str(PASEO), "run", "-d", "--title", title, "--provider", "goose" if model.startswith("goose") else "omp",
           "--model", model.removeprefix("goose/"), "--json"]
    if worktree:
        cmd += ["--new-workspace", "worktree", "--worktree-mode", "branch-off", "--base", base, "--new-branch", branch, "--worktree-slug", worktree]
    if cwd: cmd += ["--cwd", str(cwd)]
    if extra: cmd += extra
    cmd.append(brief)
    r = sh(cmd, env=env, timeout=120)
    out = json.loads(r.stdout)
    return out["agentId"]

def watch(agent_id, label_, ticket, stage):
    if PIPELINE.exists():
        sh([str(PIPELINE), "add", agent_id, label_, ticket, stage], check=False)

def wait_idle(agent_id, timeout_s):
    env = paseo_env()
    sh([str(PASEO), "wait", agent_id, "--timeout", str(timeout_s)], env=env, check=False, timeout=timeout_s + 60)
    r = sh([str(PASEO), "inspect", agent_id, "--json"], env=env)
    return json.loads(r.stdout)

def logs_tail(agent_id, n=40):
    r = sh([str(PASEO), "logs", agent_id], env=paseo_env(), check=False)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return "\n".join(lines[-n:])

# ── briefs ───────────────────────────────────────────────────────────────────
def brief_header(t, c, stage, needs):
    return f"""You are stage **{stage}** of a gated pipeline for ticket {t} in {c['repo']} (base branch `{c['base']}`).
GATE CHECK FIRST: read .forge/{t}.json. The stage `{needs}` MUST have status "pass". If not, STOP and reply exactly: GATE FAILED.
You may write ONLY the files this brief names. Never commit, stash, checkout, or touch the tracker — the orchestrator does that.
Persist your deliverable to disk BEFORE your final reply. Final reply under 200 words. Keep every command's output small (head -60, targeted greps)."""

def brief_triage(t, c, iss):
    return f"""{brief_header(t, c, "triage", "none")}

TASK: triage a feature request. Read the issue and the repo's docs/ (charter, ADRs, plan). Decide ONE of:
- ACCEPT — in scope, well-formed, ready for spec. Say which plan wave/slice it belongs to.
- NEEDS-INFO — list the exact questions.
- REJECT — cite the doctrine/ADR line it violates.
Also: is it a duplicate of an open issue? (`gh issue list -R {c['repo']} --search "<keywords>"`).

ISSUE #{iss['number']}: {iss['title']}
---
{iss['body'] or '(no body)'}
---
Write /tmp/forge-{t}-triage.md with: verdict line (ACCEPT|NEEDS-INFO|REJECT), wave/slice, duplicate check, rationale (≤10 lines). Then reply with the verdict line only."""

def brief_spec(t, c, iss):
    return f"""{brief_header(t, c, "spec", "triage")}

TASK: write the implementation spec for this ticket. PREMISE AUDIT FIRST: compare the ticket text against the code and docs — stale descriptions are the norm; the code wins, report discrepancies.

Then write .forge/{t}.spec.md containing, in order:
1. Scope (one paragraph) and explicit OUT of scope (name the sibling ticket that owns each deferred item)
2. Exact tables/columns touched (with types), event types emitted (`pluginId:type`), and their schema_version
3. HTTP API shape: every endpoint, request/response Schema, error union
4. Sync shapes affected (which collections change)
5. Files to CREATE and the specific existing file each one mirrors; files to MODIFY
6. UI surfaces (pixel-frozen — list the fork screens that must keep rendering identically)
7. TEST PLAN: every test case with its RED condition stated (what must fail before the code exists), the negative control (what sabotage must turn the suite red), and which of the 14 reconciliation queries this slice owns
8. Suggested vertical build order (thinnest end-to-end path first)

ISSUE #{iss['number']}: {iss['title']}
---
{iss['body'] or ''}
---
Reply with: spec written, N tests planned, N files to create."""

def brief_implement(t, c, spec, cycle, review_defects=None):
    rework = f"""

REWORK CYCLE {cycle}. The previous review FAILED with these defects — fix ALL of them, nothing else:
{review_defects}
""" if review_defects else ""
    return f"""{brief_header(t, c, "implement", "spec")}

You are in an isolated git worktree on a fresh branch. Implement EXACTLY the spec below — do not reinterpret the ticket.{rework}

TDD CONTRACT (non-negotiable):
1. RED: write the failing test first. Run it. PASTE the failure output into your reply.
2. GREEN: minimal code to pass. Run it. Paste the pass.
3. NEGATIVE CONTROL: apply the sabotage the spec names, run the suite, PASTE the red; revert; paste the green.
4. Gates: {" && ".join(c['gates'])}. Paste real output.
5. When green: `git add -A && git commit -m "<type>(<scope>): <summary>" -m "Closes #{t.split('-')[-1]}"` and `git push -u origin HEAD`. Then `gh pr create -R {c['repo']} --base {c['base']} --fill --body "Closes #{t.split('-')[-1]}"` and reply with the PR URL.
   (Committing on YOUR branch in YOUR worktree is the one exception to the no-commit rule — the orchestrator merges, you never do.)
6. Budget: {c.get('implement_budget_min', 90)} minutes. If you cannot finish, commit what is GREEN, push, open the PR as draft, and say exactly what remains.

Every UI-touching change: run `{c.get('screenshot_cmd', 'bun run e2e:screens')}` — it captures ALL Playwright projects ({', '.join(c.get('viewports', ['desktop','tablet','mobile','mobile-small']))}) — and commit the PNGs under e2e/__screenshots__/<project>/. A UI change with screenshots for only one viewport is incomplete. Mobile projects use real touch (page.tap), not mouse.

=== SPEC (verbatim) ===
{spec}
=== END SPEC ==="""

def brief_review(t, c, spec, pr, cycle):
    return f"""{brief_header(t, c, "review", "implement")}

You are the ADVERSARIAL reviewer. You did not write this. Your job is to find what is wrong, not to confirm what is right. Review the DIFF, not the implementer's summary — summaries are hypotheses.

PR: {pr['url']}   Get the diff: `gh pr diff {pr['number']} -R {c['repo']}`   Checkout: `gh pr checkout {pr['number']} -R {c['repo']}` (read-only for you).

AUDIT, in order, each with a per-item verdict:
1. SPEC COMPLIANCE — every numbered item in the spec below: implemented / missing / deviated. Anything outside the spec = scope creep, list it.
2. TESTS THAT CANNOT FAIL — for each new test, ask: what code change would make this red? If you cannot name one, the test is decorative. Replay the spec's negative control yourself and PASTE the red/green.
3. MIGRATIONS — any modified/deleted migration that already shipped? (`git tag --contains`). Journal reformatted wholesale instead of appended?
4. DOCTRINE — direct SQL writes bypassing the API (D12)? Event without actor? Mutation without event? Hardcoded hex instead of token? Model call from the control plane (D4)?
5. WORKER DEBRIS — stray files, commented code, debug logs, giant generated diffs.
6. SCREENSHOTS — present for every UI surface the spec names AND for every Playwright project ({', '.join(c.get('viewports', ['desktop','tablet','mobile','mobile-small']))})? A PR that only regenerated desktop PNGs is REWORK. Do they differ from baseline where they should and match where they shouldn't? Did the mobile layout actually get exercised with touch?
7. Re-run the focused tests and the gates yourself. Paste output.

Write .forge/{t}.review-{cycle}.md: verdict line (PASS|REWORK), then the per-item table, then a DEFECTS list (numbered, each with file:line and the exact fix expected). Reply with the verdict line and defect count only.

=== SPEC ===
{spec}
=== END SPEC ==="""

# ── stages ───────────────────────────────────────────────────────────────────
def cmd_init(args):
    root = repo_root()
    p = root / ".forge/config.json"
    if p.exists() and "--force" not in args: die(f"{p} exists (use --force)")
    origin = sh(["git", "remote", "get-url", "origin"]).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/.]+)", origin)
    conf = {
        "repo": m.group(1) if m else "OWNER/REPO",
        "base": "dev",
        "ticket_prefix": "STL",
        "gates": ["bun run lint", "bun run typecheck", "bun test", "bun run build"],
        "e2e": "bun run e2e",
        "screenshot_cmd": "bun run e2e:screens",
        "viewports": ["desktop", "tablet", "mobile", "mobile-small"],
        "models": {
            "triage": "goose/glm/glm-5.3-flash",
            "spec": "glm/glm-5.3",
            "implement": ["cx/gpt-6-astra", "glm/glm-5.3-flash"],
            "review": "glm/glm-5.3"
        },
        "implement_budget_min": 90,
        "stage_timeout_s": {"triage": 900, "spec": 1800, "implement": 7200, "review": 2400}
    }
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(conf, indent=2) + "\n")
    (root / ".forge/.gitignore").write_text("# state files ARE committed; only scratch is ignored\n*.tmp\n")
    ensure_labels(conf["repo"])
    print(f"wrote {p}\nlabels ensured on {conf['repo']}\nedit models/gates, then `forge triage <issue#>`")

def ticket_id(c, n): return f"{c['ticket_prefix']}-{n}"

def cmd_triage(args):
    c = cfg(); n = args[0]; t = ticket_id(c, n); iss = issue(n, c["repo"])
    record(t, "triage", "running")
    a = dispatch(f"forge triage {t}", brief_triage(t, c, iss), c["models"]["triage"], cwd=repo_root())
    watch(a, f"{t}-triage", t, "triage")
    print(f"dispatched {a}; waiting…")
    wait_idle(a, c["stage_timeout_s"]["triage"])
    out = Path(f"/tmp/forge-{t}-triage.md")
    text = out.read_text() if out.exists() else logs_tail(a)
    verdict = next((w for w in ("ACCEPT", "NEEDS-INFO", "REJECT") if w in text.split("\n", 3)[0].upper()), None) or ("ACCEPT" if "ACCEPT" in text.upper() else "NEEDS-INFO")
    comment(n, c["repo"], f"### forge · triage → **{verdict}**\n\n{text}\n\n_agent `{a}`_")
    if verdict == "ACCEPT":
        record(t, "triage", "pass", agent=a); set_stage_label(n, c["repo"], "spec")
    elif verdict == "REJECT":
        record(t, "triage", "rejected", agent=a); set_stage_label(n, c["repo"], "rejected")
    else:
        record(t, "triage", "blocked", agent=a); set_stage_label(n, c["repo"], "blocked")
    print(f"{t} triage → {verdict}")

def cmd_spec(args):
    c = cfg(); n = args[0]; t = ticket_id(c, n); gate(t, "triage"); iss = issue(n, c["repo"])
    record(t, "spec", "running")
    a = dispatch(f"forge spec {t}", brief_spec(t, c, iss), c["models"]["spec"], cwd=repo_root())
    watch(a, f"{t}-spec", t, "spec")
    print(f"dispatched {a}; waiting…")
    wait_idle(a, c["stage_timeout_s"]["spec"])
    if not spec_path(t).exists():
        record(t, "spec", "fail", agent=a, reason="no spec file written")
        die(f"spec agent produced no .forge/{t}.spec.md — see `paseo logs {a}`")
    spec = spec_path(t).read_text()
    sh(["git", "add", str(spec_path(t)), str(state_path(t))]); 
    sh(["git", "commit", "-q", "-m", f"forge({t}): spec", "--no-verify"], check=False)
    comment(n, c["repo"], f"### forge · spec written\n\n<details><summary>.forge/{t}.spec.md</summary>\n\n{spec[:6000]}\n\n</details>\n\n_agent `{a}`_")
    record(t, "spec", "pass", agent=a, artifact=f".forge/{t}.spec.md"); set_stage_label(n, c["repo"], "implement")
    print(f"{t} spec → pass")

def cmd_implement(args):
    c = cfg(); n = args[0]; t = ticket_id(c, n); gate(t, "spec")
    s = load_state(t); cycle = s.get("cycle", 0) + 1
    if cycle > MAX_CYCLES: die(f"{t} exceeded {MAX_CYCLES} rework cycles — escalate to a human")
    s["cycle"] = cycle; save_state(t, s)
    spec = spec_path(t).read_text()
    defects = None
    if cycle > 1:
        prev = review_path(t, cycle - 1)
        if prev.exists():
            body = prev.read_text(); i = body.upper().find("DEFECTS"); defects = body[i:] if i >= 0 else body
    model = c["models"]["implement"][(cycle - 1) % len(c["models"]["implement"])]
    branch = f"forge/{t.lower()}-c{cycle}"
    record(t, "implement", "running", cycle=cycle, model=model, branch=branch)
    a = dispatch(f"forge implement {t} c{cycle}", brief_implement(t, c, spec, cycle, defects), model,
                 worktree=f"{t.lower()}-c{cycle}", base=c["base"], branch=branch)
    watch(a, f"{t}-impl-c{cycle}", t, "implement")
    print(f"dispatched {a} on {branch} ({model}); waiting up to {c['stage_timeout_s']['implement']}s…")
    wait_idle(a, c["stage_timeout_s"]["implement"])
    prs = json.loads(gh(["pr", "list", "--head", branch, "--json", "number,url,isDraft,state"], c["repo"]).stdout)
    if not prs:
        record(t, "implement", "fail", agent=a, cycle=cycle, reason="no PR opened")
        die(f"no PR on {branch}. Salvage: `git -C <worktree> status`; `paseo logs {a} | tail -40`")
    pr = prs[0]
    record(t, "implement", "pass", agent=a, cycle=cycle, pr=pr["number"], pr_url=pr["url"], draft=pr["isDraft"])
    comment(n, c["repo"], f"### forge · implement (cycle {cycle}, `{model}`)\n\nPR: {pr['url']}{' (DRAFT — incomplete)' if pr['isDraft'] else ''}\n\n<details><summary>agent tail</summary>\n\n```\n{logs_tail(a, 30)}\n```\n</details>")
    set_stage_label(n, c["repo"], "review")
    print(f"{t} implement c{cycle} → {pr['url']}")

def cmd_review(args):
    c = cfg(); n = args[0]; t = ticket_id(c, n); gate(t, "implement")
    s = load_state(t); cycle = s["cycle"]
    impl = next(st for st in reversed(s["stages"]) if st["stage"] == "implement" and st["status"] == "pass")
    # Reviewer is chosen to be a DIFFERENT family from whoever implemented this cycle.
    impl_fam = family(impl["model"])
    reviewers = c["models"]["review"] if isinstance(c["models"]["review"], list) else [c["models"]["review"]]
    reviewer = next((m for m in reviewers if family(m) != impl_fam), None)
    if reviewer is None:
        die(f"no reviewer in {reviewers} is a different family from implementer {impl['model']} — refusing (rubber-stamp risk)")
    pr = json.loads(gh(["pr", "view", str(impl["pr"]), "--json", "number,url,headRefName"], c["repo"]).stdout)
    spec = spec_path(t).read_text()
    record(t, "review", "running", cycle=cycle, model=reviewer)
    a = dispatch(f"forge review {t} c{cycle}", brief_review(t, c, spec, pr, cycle), reviewer, cwd=repo_root())
    watch(a, f"{t}-review-c{cycle}", t, "review")
    print(f"dispatched {a}; waiting…")
    wait_idle(a, c["stage_timeout_s"]["review"])
    rp = review_path(t, cycle)
    if not rp.exists():
        record(t, "review", "fail", agent=a, reason="no review file"); die(f"reviewer wrote nothing — `paseo logs {a}`")
    body = rp.read_text(); verdict = "PASS" if body.strip().upper().startswith("PASS") else "REWORK"
    sh(["git", "add", str(rp), str(state_path(t))]); sh(["git", "commit", "-q", "-m", f"forge({t}): review c{cycle} {verdict}", "--no-verify"], check=False)
    gh(["pr", "comment", str(pr["number"]), "--body", f"### forge · adversarial review (cycle {cycle}, `{c['models']['review']}`) → **{verdict}**\n\n{body[:8000]}"], c["repo"])
    if verdict == "PASS":
        record(t, "review", "pass", agent=a, cycle=cycle, artifact=str(rp.relative_to(repo_root()))); set_stage_label(n, c["repo"], "merge-gate")
    else:
        record(t, "review", "rework", agent=a, cycle=cycle, artifact=str(rp.relative_to(repo_root()))); set_stage_label(n, c["repo"], "rework")
        # re-open the implement gate for the next cycle
        record(t, "spec", "pass", note="re-armed for rework")
    print(f"{t} review c{cycle} → {verdict}")

def cmd_merge(args):
    """Orchestrator-only. Fresh worktree at the PR head; run every gate ourselves; squash-merge."""
    c = cfg(); n = args[0]; t = ticket_id(c, n); gate(t, "review")
    s = load_state(t)
    impl = next(st for st in reversed(s["stages"]) if st["stage"] == "implement" and st["status"] == "pass")
    pr = json.loads(gh(["pr", "view", str(impl["pr"]), "--json", "number,url,headRefOid,headRefName,isDraft,mergeable"], c["repo"]).stdout)
    if pr["isDraft"]: die("PR is a draft — implementer declared it incomplete")
    if pr["mergeable"] == "CONFLICTING": die("PR has conflicts with base — rework required")
    root = repo_root(); wt = Path(f"/tmp/forge-merge-{t.lower()}")
    if wt.exists(): sh(["git", "worktree", "remove", "--force", str(wt)], cwd=root, check=False)
    sh(["git", "fetch", "-q", "origin", pr["headRefName"]], cwd=root)
    sh(["git", "worktree", "add", "--detach", str(wt), pr["headRefOid"]], cwd=root)
    record(t, "merge-gate", "running", pr=pr["number"], sha=pr["headRefOid"])
    results = []
    try:
        if (wt / "package.json").exists() and not (wt / "node_modules").exists():
            sh("bun install --frozen-lockfile", cwd=wt, timeout=900)
        for g in c["gates"] + ([c["e2e"]] if c.get("e2e") else []):
            r = sh(g, cwd=wt, check=False, timeout=1800)
            results.append((g, r.returncode, (r.stdout + r.stderr)[-1200:]))
        # debris audit: files the spec never named
        diff_files = sh(["git", "diff", "--name-only", f"origin/{c['base']}...{pr['headRefOid']}"], cwd=root).stdout.split()
        debris = [f for f in diff_files if re.search(r"(\.log$|\.tmp$|^\.DS_Store|/debug|console\.log)", f)]
    finally:
        sh(["git", "worktree", "remove", "--force", str(wt)], cwd=root, check=False)
    failed = [g for g, rc, _ in results if rc]
    table = "\n".join(f"| `{g}` | {'✅' if rc == 0 else '❌'} |" for g, rc, _ in results)
    detail = "\n\n".join(f"<details><summary>{g}</summary>\n\n```\n{o}\n```\n</details>" for g, rc, o in results if rc)
    if failed or debris:
        record(t, "merge-gate", "fail", pr=pr["number"], failed=failed, debris=debris)
        gh(["pr", "comment", str(pr["number"]), "--body", f"### forge · merge gate → **FAIL**\n\n| gate | result |\n|---|---|\n{table}\n\n{'Debris: ' + ', '.join(debris) if debris else ''}\n\n{detail}"], c["repo"])
        set_stage_label(n, c["repo"], "rework"); record(t, "spec", "pass", note="re-armed after merge-gate fail")
        die(f"merge gate FAILED: {failed or debris}")
    gh(["pr", "comment", str(pr["number"]), "--body", f"### forge · merge gate → **PASS**\n\nFresh worktree at `{pr['headRefOid'][:8]}`; gates run by orchestrator, not trusted from agent.\n\n| gate | result |\n|---|---|\n{table}"], c["repo"])
    gh(["pr", "merge", str(pr["number"]), "--squash", "--delete-branch", "--body", f"Closes #{n}"], c["repo"], capture=True)
    merged = json.loads(gh(["pr", "view", str(pr["number"]), "--json", "mergeCommit"], c["repo"]).stdout)
    record(t, "merge-gate", "pass", pr=pr["number"]); record(t, "merged", "pass", commit=merged["mergeCommit"]["oid"])
    set_stage_label(n, c["repo"], "merged")
    sh(["git", "pull", "-q", "--ff-only", "origin", c["base"]], cwd=root, check=False)
    print(f"{t} MERGED → {merged['mergeCommit']['oid'][:8]}")

def cmd_status(args):
    root = repo_root(); files = [state_path(args[0])] if args else sorted((root / ".forge").glob("*.json"))
    files = [f for f in files if f.name != "config.json"]
    if not files: print("no tickets"); return
    print(f"{'ticket':<10} {'cycle':>5}  " + "  ".join(f"{s:<10}" for s in STAGES))
    for f in files:
        s = json.loads(f.read_text()); row = [stage_status(s, st) or "-" for st in STAGES]
        print(f"{s['ticket']:<10} {s.get('cycle',0):>5}  " + "  ".join(f"{r:<10}" for r in row))

def cmd_drain(_):
    if PIPELINE.exists(): print(sh([str(PIPELINE), "drain"], check=False).stdout)

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"): print(__doc__); return
    cmd, args = sys.argv[1], sys.argv[2:]
    fn = {"init": cmd_init, "triage": cmd_triage, "spec": cmd_spec, "implement": cmd_implement,
          "review": cmd_review, "merge": cmd_merge, "status": cmd_status, "drain": cmd_drain}.get(cmd)
    if fn is None:
        die(f"unknown command {cmd}\n{__doc__}")
        return
    fn(args)

if __name__ == "__main__":
    main()
