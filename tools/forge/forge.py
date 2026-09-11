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
  forge adopt    <issue#> <agent_id>           re-attach to an orphaned running implementer
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
class _Paseo:
    """Resolve the paseo binary per call. An npm global upgrade replaces the symlink; a watcher that cached
    the path at import time died mid-cycle (c27) with FileNotFoundError while the agent kept working."""
    def __str__(self):
        import shutil
        for cand in (HOME / ".local/node/bin/paseo", Path(shutil.which("paseo") or "")):
            if cand and cand.exists(): return str(cand)
        return str(HOME / ".local/node/bin/paseo")
    __fspath__ = __str__
PASEO = _Paseo()
PASEO_ENV = HOME / ".paseo-env"
PIPELINE = HOME / ".local/bin/kaneo-pipeline"

STAGES = ["triage", "spec", "implement", "review", "merge-gate", "merged"]
MAX_CYCLES = 3

# ── util ─────────────────────────────────────────────────────────────────────
def die(msg, code=1):
    print(f"forge: {msg}", file=sys.stderr); sys.exit(code)

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def sh(cmd, cwd=None, env=None, check=True, capture=True, timeout=600):
    # paseo calls are retried through transient daemon/binary hiccups (npm upgrade swapping the symlink,
    # daemon restart, 'Connection timed out'): a watcher must outlive a 30s blip, not lose the cycle to it.
    is_paseo = not isinstance(cmd, str) and cmd and str(cmd[0]).endswith("/paseo")
    for attempt in range(6 if is_paseo else 1):
        try:
            r = subprocess.run(cmd, cwd=cwd, env=env, shell=isinstance(cmd, str),
                               capture_output=capture, text=True, timeout=timeout)
        except FileNotFoundError:
            if is_paseo and attempt < 5: time.sleep(10); cmd = [str(PASEO), *cmd[1:]]; continue
            raise
        if is_paseo and r.returncode and attempt < 5 and ("Cannot connect to daemon" in (r.stderr or "") or "ECONNREFUSED" in (r.stderr or "")):
            time.sleep(10); continue
        break
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
    if stage == "implement" and status == "running" and extra.get("cycle"): s["cycle"] = extra["cycle"]
    s["stages"].append({"stage": stage, "status": status, "at": now(), **extra})
    save_state(t, s)
    return s

def gate(t, needs, this=None):
    """Refuse to start a stage unless its predecessor passed — and refuse if THIS stage is already running."""
    s0 = load_state(t)
    if this and stage_status(s0, this) == "running":
        die(f"gate: {this} for {t} is already running (another forge process owns it). Refusing to double-dispatch.")
    st = stage_status(s0, needs)
    if st != "pass":
        die(f"gate: {needs} is '{st}', not 'pass' — cannot proceed. Fix the predecessor or `forge status {t}`.")

def family(model_id):
    m = model_id.lower().split("/", 1)[-1] if model_id.lower().startswith(("hermes", "goose/")) else model_id.lower()
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
def c_get(key, default=None):
    try: return json.loads((repo_root() / ".forge/config.json").read_text()).get(key, default)
    except Exception: return default

def split_model(spec):
    """'hermes:accept_edits/<model>' | 'hermes/<model>' | 'goose/<model>' | '<gateway model>' (→ omp)."""
    if spec.startswith("hermes"):
        head, _, model = spec.partition("/")
        mode = head.partition(":")[2] or "default"
        # Paseo validates --model against the Hermes ACP catalog, whose ids are ENCODED as
        # `custom:<provider-slug>:<model>` for named endpoints. A bare `glm/glm-5.3-flash` fails that
        # check, Paseo logs a warning and silently runs the session on Hermes's DEFAULT model. Every
        # cycle before this fix ran on the default (which was `gpt` = astra) regardless of the roster.
        if model and not model.startswith(("custom:", "openai-codex:", "zai:", "moa:")):
            model = f"custom:9router:{model}"
        return "hermes", model or None, mode
    if spec.startswith("goose/"):
        return "goose", spec[len("goose/"):], None
    return "omp", spec, None

def model_preflight(model_spec, timeout=60):
    """One 6-token completion through 9router for the lane's model. Returns (ok, reason). A quota 429, an
    upstream 5xx, or a 400 like OpenCode's MissingSessionID means the whole cycle would burn with zero
    model calls — c23 (ocg) and c24 (glm 5h quota) both did exactly that. Cheap to check first."""
    import urllib.request, urllib.error
    _, model, _ = split_model(model_spec)
    bare = (model or "").split("custom:9router:", 1)[-1]
    if not bare: return True, "no model"
    key = None
    for line in (Path.home() / ".hermes/.env").read_text().splitlines():
        if line.startswith(("AIPROXY_API_KEY=", "export AIPROXY_API_KEY=")): key = line.split("=", 1)[1].strip().strip('"')
    if not key: return True, "no key to preflight with"
    body = json.dumps({"model": bare, "messages": [{"role": "user", "content": "Reply: ok"}], "max_tokens": 6}).encode()
    req = urllib.request.Request("https://aiproxy.entelechia.cloud/v1/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                          "User-Agent": "forge-preflight/1 (curl-compatible)"})  # CF 1010 blocks urllib's default UA
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read().decode(errors="ignore")
            if '"error"' in txt[:200]: return False, txt[:160]
            return True, "ok"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode(errors='ignore')[:160]}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"

def pick_model(candidates, stage, t):
    """First roster entry whose model answers a preflight. Records skipped ones in the ticket state."""
    if isinstance(candidates, str): candidates = [candidates]
    for spec in candidates:
        ok, why = model_preflight(spec)
        if ok: return spec
        print(f"forge: {stage} {t}: skipping {spec} — preflight failed: {why}", file=sys.stderr)
        s = load_state(t); s["stages"].append({"stage": stage, "status": "note", "at": now(), "note": f"preflight skip {spec}: {why[:140]}"}); save_state(t, s)
    return None

def dispatch(title, brief, model_spec, cwd=None, worktree=None, base=None, branch=None, extra=None):
    """Briefs can exceed ARG_MAX (a 1200-line spec did). Write the brief to a file and hand the agent
    a short pointer prompt; the agent's first action is to read it. The file lives under the repo's
    .forge/briefs/ so it is inspectable and survives the run."""
    env = paseo_env()
    provider, model, mode = split_model(model_spec)
    bdir = repo_root() / ".forge/briefs"; bdir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]
    bpath = bdir / f"{slug}-{int(time.time())}.md"
    bpath.write_text(brief)
    pointer = (f"Your full brief is in the file {bpath} — read it FIRST with your file-reading tool, in full, "
               f"then follow it exactly. Do not begin any other action before reading it.")
    cmd = [str(PASEO), "run", "-d", "--title", title, "--provider", provider, "--json"]
    # Operator rule: subagents live in the orchestrator's OWN Paseo workspace. Never --new-workspace (each
    # one became a duplicate "dev" workspace in the operator's sidebar: 23 of them).
    home_ws = os.environ.get("FORGE_WORKSPACE") or c_get("paseo_workspace")
    if home_ws: cmd += ["--workspace", home_ws]
    if model:
        bare = model.split("custom:9router:", 1)[-1]
        if bare.startswith("cx/") or bare in ("gpt", "gpt-mini") or "astra" in bare or "sol" in bare or "spark" in bare:
            raise SystemExit(f"forge: refusing to dispatch a subagent on {model!r} — operator ruling: no gpt/cx models for subagents (only cx/gpt-5.6-luna is permitted, and only by hand)")
        cmd += ["--model", model]
    if mode:  cmd += ["--mode", mode]
    if worktree:
        # Our own git worktree (not a Paseo workspace) so the implementer has an isolated checkout.
        wt = repo_root() / ".forge/worktrees" / worktree
        if not wt.exists():
            sh(["git", "fetch", "-q", "origin", base], cwd=repo_root(), check=False)
            sh(["git", "worktree", "add", "-q", "-b", branch, str(wt), f"origin/{base}"], cwd=repo_root())
        cwd = wt
    if cwd: cmd += ["--cwd", str(cwd)]
    if extra: cmd += extra
    cmd.append(pointer)
    r = sh(cmd, env=env, timeout=120)
    out = json.loads(r.stdout)
    return out["agentId"]

def watch(agent_id, label_, ticket, stage):
    if PIPELINE.exists():
        sh([str(PIPELINE), "add", agent_id, label_, ticket, stage], check=False)

def wait_idle(agent_id, timeout_s, worktree=None, on_question=None):
    """Poll until idle/completed. Two mid-run interrupts are handled without ending the stage:
    - status 'permission' (edit under a read-only mode): stop + die, nobody can approve.
    - a `.forge-question.md` appearing in the worktree: the agent needs a ruling. Call on_question(text)
      to get an answer, `paseo send` it, delete the file, keep waiting. Questions are logged to the stage."""
    env = paseo_env(); t0 = time.time(); answered = 0
    qfile = (Path(worktree) / ".forge-question.md") if worktree else None
    while time.time() - t0 < timeout_s:
        if qfile and qfile.exists() and on_question:
            q = qfile.read_text().strip()
            ans = on_question(q, answered)
            if ans:
                (Path(worktree) / f".forge-answer-{answered+1}.md").write_text(ans)
                qfile.unlink()
                sh([str(PASEO), "send", agent_id, "--no-wait", "--prompt",
                    f"ORCHESTRATOR ANSWER (question {answered+1}) — written to .forge-answer-{answered+1}.md in your worktree. Read it and continue; do not stop for this again.\n\n{ans}"],
                   env=env, check=False, timeout=90)
                answered += 1
                print(f"answered question {answered} for {agent_id}")
        r = sh([str(PASEO), "inspect", agent_id, "--json"], env=env, check=False)
        if r.returncode == 0:
            d = json.loads(r.stdout); st = (d.get("Status") or d.get("status") or "").lower()
            if st in ("idle", "completed", "error", "failed", "stopped"):
                d["_answered"] = answered; return d
            if st == "permission":
                sh([str(PASEO), "stop", agent_id], env=env, check=False)
                die(f"agent {agent_id} is blocked on an edit-permission prompt (read-only mode). Stopped. `paseo logs {agent_id} | tail`")
        time.sleep(15)
    die(f"agent {agent_id} did not go idle within {timeout_s}s — `paseo logs {agent_id} | tail`")

def logs_tail(agent_id, n=40):
    r = sh([str(PASEO), "logs", agent_id], env=paseo_env(), check=False)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return "\n".join(lines[-n:])

# ── briefs ───────────────────────────────────────────────────────────────────
def brief_header(t, c, stage, needs):
    root = repo_root()
    gate_line = (f"GATE CHECK FIRST: read {root}/.forge/{t}.json. The most recent entry for stage `{needs}` MUST have status \"pass\". If not, STOP and reply exactly: GATE FAILED."
                 if needs else
                 f"This is the FIRST stage; there is no predecessor gate. Do not look for one.")
    return f"""You are stage **{stage}** of a gated pipeline for ticket {t} in {c['repo']} (base branch `{c['base']}`). Repository root: {root}
{gate_line}
You may write ONLY the files this brief names. Never commit, stash, checkout, or touch the tracker — the orchestrator does that.
Persist your deliverable to disk BEFORE your final reply, using absolute paths exactly as given. Final reply under 200 words. Keep every command's output small (head -60, targeted greps)."""

def brief_triage(t, c, iss):
    return f"""{brief_header(t, c, "triage", None)}

TASK: triage a feature request. Read the issue and the repo's docs/ (charter, ADRs, plan). Decide ONE of:
- ACCEPT — in scope, well-formed, ready for spec. Say which plan wave/slice it belongs to.
- NEEDS-INFO — list the exact questions.
- REJECT — cite the doctrine/ADR line it violates.
Also: is it a duplicate of an open issue? (`gh issue list -R {c['repo']} --search "<keywords>"`).

ISSUE #{iss['number']}: {iss['title']}
---
{iss['body'] or '(no body)'}
---
Write /tmp/forge-{t}-triage.md using your file-writing tool. Its FIRST LINE must be exactly one of: ACCEPT / NEEDS-INFO / REJECT. Then: wave/slice, duplicate check, rationale (≤10 lines). The file is the ONLY channel the orchestrator reads — a reply without the file is a failed stage. Then reply with the verdict line only."""

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

YOU ARE THE IMPLEMENTER. Do NOT delegate, spawn, or create other agents (no paseo, no create_agent, no delegate_task, no subagents). Do the work yourself in this worktree. Dispatching another agent counts as doing nothing and fails the cycle.

TDD CONTRACT (non-negotiable):
1. RED: write the failing test first. Run it. PASTE the failure output into your reply.
2. GREEN: minimal code to pass. Run it. Paste the pass.
3. NEGATIVE CONTROL: apply the sabotage the spec names, run the suite, PASTE the red; revert; paste the green.
4. Gates: {" && ".join(c['gates'])}. Paste real output.
5. When green: `git add -A && git commit -m "<type>(<scope>): <summary>" -m "Closes #{t.split('-')[-1]}"` and `git push -u origin HEAD`. Then `gh pr create -R {c['repo']} --base {c['base']} --fill --body "Closes #{t.split('-')[-1]}"` and reply with the PR URL.
   (Committing on YOUR branch in YOUR worktree is the one exception to the no-commit rule — the orchestrator merges, you never do.)
6. Budget: {c.get('implement_budget_min', 90)} minutes. If you cannot finish, commit what is GREEN, push, open the PR as draft, and say exactly what remains.
   COMMIT CADENCE (hard rule): commit and push every time a test goes green with its negative control — never hold more than ONE green unit of work uncommitted. Your worktree is disposable: the daemon reaps idle agents and everything uncommitted is gone. One lost cycle cost this project a worker-lifecycle span test and a T12 recovery test; do not repeat it.
7. SPEC GAP PROTOCOL: if the spec omits something you need AND it changes behaviour or scope, do NOT invent. Write the gap to `.forge-blocker.md` at the ROOT OF YOUR WORKTREE (your cwd — not the main checkout, which you cannot write), and make your final reply start with the literal line `BLOCKED: spec gap`. The orchestrator amends the spec and re-dispatches.
   QUESTION PROTOCOL (preferred over blocking): if you need a ruling but can keep working on other parts, write the question to `.forge-question.md` at your worktree root and CONTINUE with unblocked work. The orchestrator answers within minutes via a message and `.forge-answer-N.md`; read it and proceed. Only use BLOCKED when nothing at all can proceed.
   PRE-AUTHORISED (do not stop for these; log them in `.forge-deps-added.md` in your worktree with file:line evidence): adding a dependency the mirrored source imports but no manifest declares — pin to the version in the mirror's installed node_modules if present, else current npm. Missing config/alias plumbing the mirror relies on — mirror it. A missing file the mirror imports — mirror it too and note it. Stop only for gaps that would make you choose behaviour.

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
7. SPANS (ADR 0010) — is every new/changed service function an `Effect.fn("Module.name")`? Do new endpoints carry http.route/method/status/stellarc.org/stellarc.principal.kind? Does at least one test assert on a span for each new path, and does that assertion go red when the instrumentation is removed? Any `console.*` outside tests/fatal handler? Any statement text or PII (email, token) in span attributes?
8. Re-run the focused tests and the gates yourself. Paste output.

Write .forge/{t}.review-{cycle}.md: verdict line (PASS|REWORK), then the per-item table, then a DEFECTS list (numbered, each with file:line and the exact fix expected). Reply with the verdict line and defect count only.

=== SPEC ===
{spec}
=== END SPEC ==="""


# ── question policy ──────────────────────────────────────────────────────────
def answer_question(t, c, spec):
    """Return a callable(question, n) -> answer. Mechanical rulings first; unresolved → write
    .forge/<T>.question-<n>.md, comment the issue, and answer with an explicit HOLD so the agent
    parks rather than guesses. The orchestrator (human or Hermes) fills the answer file; the next
    poll picks it up."""
    root = repo_root()
    rules = [
        # (regex on the question, canned ruling)
        (r"undeclared|not (declared|in).*(manifest|package\.json|lockfile)", "RULING: pre-authorised. Add the dependency pinned to the version in the mirror's installed node_modules if present, else current npm. Log it in .forge-deps-added.md with file:line. Continue."),
        (r"\bbun\b.*(PATH|not found|missing)", "RULING: bun is at /home/rpw/.bun/bin/bun. Use the absolute path. Continue."),
        (r"(cannot|denied|not allowed).*(write|edit).*(main checkout|\.forge/)", "RULING: write only inside your worktree. Blocker/question/deps files go at the worktree root as .forge-*.md. Continue."),
        (r"which (version|major)|pin(ned)? version", "RULING: use the version present in /home/rpw/repos/kaneo/node_modules/.pnpm if installed, else current npm latest. Record it. Continue."),
        (r"(alias|@i18n|@/)", "RULING: mirror the fork's alias plumbing exactly (vite.config.ts + tsconfig paths). See spec §5a. Continue."),
        (r"(log|cursor|expired_handle|cache-buster|query param)", "RULING: see spec §5c — the permitted parameter table is closed. Anything not listed → 400. Continue."),
    ]
    def _answer(q, n):
        for rx, ans in rules:
            if re.search(rx, q, re.I): return ans
        # Not mechanical: park it for the orchestrator.
        qp = root / f".forge/{t}.question-{n+1}.md"; qp.write_text(q + "\n")
        ap = root / f".forge/{t}.answer-{n+1}.md"
        if ap.exists(): return ap.read_text()
        comment(t.split("-")[-1], c["repo"], f"### forge · implementer question {n+1} — **needs orchestrator ruling**\n\n{q[:3000]}\n\nWrite the answer to `.forge/{t}.answer-{n+1}.md`; the driver delivers it on the next poll.")
        return None   # keep waiting; agent stays parked on its own until answered
    return _answer

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
            "_note": "prefix hermes:<mode>/ or goose/ for ACP lanes; bare id = omp. Hermes 'default' mode blocks ALL edits (parks in permission) - use accept_edits and constrain writes in the brief.",
            "triage": "hermes:accept_edits/glm/glm-5.3-flash",
            "spec": "hermes:accept_edits/glm/glm-5.3",
            "implement": ["hermes:accept_edits/glm/glm-5.3-flash", "hermes:accept_edits/ocg/deepseek-v4-pro", "hermes:accept_edits/glm/glm-5.3"],
            "review": ["hermes:accept_edits/glm/glm-5.3", "hermes:accept_edits/ocg/deepseek-v4-pro"]
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
    st = load_state(t); st["cycle"] = 0; save_state(t, st)
    record(t, "triage", "running")
    tm = pick_model(c["models"]["triage"], "triage", t) or pick_model(c["models"]["implement"], "triage", t)
    if not tm: raise SystemExit(f"forge: triage {t}: no model available")
    a = dispatch(f"forge triage {t}", brief_triage(t, c, iss), tm, cwd=repo_root())
    watch(a, f"{t}-triage", t, "triage")
    print(f"dispatched {a}; waiting…")
    wait_idle(a, c["stage_timeout_s"]["triage"])
    out = Path(f"/tmp/forge-{t}-triage.md")
    if not out.exists():
        # No artefact = no verdict. Never infer a decision from the transcript: the
        # transcript contains our own brief, which contains every verdict word.
        record(t, "triage", "fail", agent=a, reason="agent wrote no verdict file")
        comment(n, c["repo"], f"### forge · triage → **NO VERDICT**\n\nAgent `{a}` finished without writing `/tmp/forge-{t}-triage.md`. Re-run `forge triage {n}`.\n\n<details><summary>agent tail</summary>\n\n```\n{logs_tail(a, 25)}\n```\n</details>")
        die(f"triage agent {a} produced no verdict file — refusing to infer one.\n--- agent tail ---\n{logs_tail(a, 8)}")
    text = out.read_text()
    first = text.strip().splitlines()[0].upper() if text.strip() else ""
    verdict = next((w for w in ("ACCEPT", "NEEDS-INFO", "REJECT") if w in first), None)
    if verdict is None:
        record(t, "triage", "fail", agent=a, reason=f"first line not a verdict: {first[:80]}")
        die(f"triage file's first line is not ACCEPT|NEEDS-INFO|REJECT: {first[:80]!r}")
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
    sm = pick_model(c["models"]["spec"], "spec", t) or pick_model(c["models"]["implement"], "spec", t)
    if not sm: raise SystemExit(f"forge: spec {t}: no model available")
    a = dispatch(f"forge spec {t}", brief_spec(t, c, iss), sm, cwd=repo_root())
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

import fcntl
def _lock(t):
    lf = open(repo_root() / f".forge/.{t}.lock", "w")
    try: fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: die(f"{t}: another forge process holds the lock — refusing to run concurrently")
    return lf

def cmd_implement(args):
    c = cfg(); n = args[0]; t = ticket_id(c, n); _lk = _lock(t); gate(t, "spec", this="implement")
    s = load_state(t)
    def _idx(stage, status):
        return max([i for i, x in enumerate(s["stages"]) if x["stage"] == stage and x["status"] == status], default=-1)
    if _idx("implement", "pass") > max(_idx("review", "rework"), _idx("merge-gate", "fail")):
        die(f"{t}: latest implement already PASSED and no newer rework — next stage is review, not implement")
    cycle = s.get("cycle", 0) + 1
    # Only REWORK cycles (review said REWORK / merge-gate failed) count against the cap. Cycles that
    # ended in a spec gap are the orchestrator's defect, not the implementer's; they consume a branch
    # number but not the budget.
    rework_cycles = sum(1 for st in s["stages"] if st["stage"] == "review" and st["status"] == "rework") \
                  + sum(1 for st in s["stages"] if st["stage"] == "merge-gate" and st["status"] == "fail")
    if rework_cycles >= MAX_CYCLES: die(f"{t} hit {MAX_CYCLES} rework cycles — escalate to a human")
    spec = spec_path(t).read_text()
    defects = None
    if cycle > 1:
        prev = review_path(t, cycle - 1)
        if prev.exists():
            body = prev.read_text(); i = body.upper().find("DEFECTS"); defects = body[i:] if i >= 0 else body
    roster = c["models"]["implement"]
    start = (cycle - 1) % len(roster)
    model = pick_model(roster[start:] + roster[:start], "implement", t)
    if not model:
        record(t, "implement", "blocked", cycle=cycle, reason="every roster model failed preflight (quota/upstream); nothing dispatched — retry next tick")
        raise SystemExit(f"forge: implement {t}: no model available (all preflights failed)")
    head_before = None
    last_impl = next((st for st in reversed(s["stages"]) if st["stage"] == "implement" and st["status"] in ("partial", "pass", "fail", "blocked")), None)
    prev_partial = last_impl if last_impl and last_impl["status"] == "partial" and last_impl.get("pr") else None
    if last_impl and last_impl["status"] == "partial" and not last_impl.get("pr"):
        # orphan reaper wrote a partial without PR metadata; inherit from the nearest earlier entry that has it
        donor = next((st for st in reversed(s["stages"]) if st["stage"] == "implement" and st.get("pr")), None)
        if donor: prev_partial = {**donor, **{k: v for k, v in last_impl.items() if v}, "pr": donor["pr"], "branch": donor.get("branch", last_impl.get("branch"))}
    if prev_partial:
        branch = prev_partial["branch"]
        # Paseo's checkout-branch mode checks out the LOCAL ref. If it lags origin (it will — agents push from
        # their own worktrees), the continuation starts from a stale base and can't fast-forward push. Sync first.
        sh(["git", "fetch", "-q", "origin", branch], cwd=repo_root(), check=False)
        r = sh(["git", "branch", "-f", branch, f"origin/{branch}"], cwd=repo_root(), check=False)
        if r.returncode:  # branch is checked out in some worktree — remove stale worktrees for this ticket first
            for wtp in [*Path.home().glob(f".paseo/worktrees/*/{t.lower()}-c*"), *(repo_root() / ".forge/worktrees").glob(f"{t.lower()}-c*")]:
                sh(["git", "worktree", "remove", "--force", str(wtp)], cwd=repo_root(), check=False)
            sh(["git", "worktree", "prune"], cwd=repo_root(), check=False)
            sh(["git", "branch", "-f", branch, f"origin/{branch}"], cwd=repo_root())
        head_before = sh(["git", "ls-remote", "origin", f"refs/heads/{branch}"], check=False).stdout.split()[:1]
        cont = (f"\n\nCONTINUATION: cycle {prev_partial['cycle']} ran out of budget and left draft PR #{prev_partial['pr']} on this branch "
                f"with committed, green work. Read `git log dev..HEAD` and the PR body's 'Remaining' list FIRST. Do NOT redo done work. "
                f"FIRST: run `git fetch origin {prev_partial['branch']} && git status -sb` and confirm HEAD == origin/{prev_partial['branch']}. If it is behind, run `git merge --ff-only origin/{prev_partial['branch']}` (pre-authorised; it is a sync, not a merge into dev). "
                f"You are ALREADY on branch `{prev_partial['branch']}` with the draft PR open. Do NOT create a new branch, do NOT open a new PR. Commit and `git push origin HEAD:{prev_partial['branch']}`. "
                f"Finish the remaining spec items, keep every existing test green, then `gh pr ready {prev_partial['pr']}`. "
                f"If you run out again, update the PR body's Remaining list and leave it draft.")
        record(t, "implement", "running", cycle=cycle, model=model, branch=branch, continues=prev_partial["cycle"], pid=os.getpid())
        # Continuation: our own git worktree checked out on the EXISTING branch (synced to origin above).
        wt = repo_root() / ".forge/worktrees" / f"{t.lower()}-c{cycle}"
        sh(["git", "worktree", "add", "-q", str(wt), branch], cwd=repo_root())
        a = dispatch(f"forge implement {t} c{cycle} (cont.)", brief_implement(t, c, spec, cycle, defects) + cont, model, cwd=wt)
        s3 = load_state(t); s3["stages"][-1]["agent"] = a; save_state(t, s3)
    else:
        branch = f"forge/{t.lower()}-c{cycle}"
        record(t, "implement", "running", cycle=cycle, model=model, branch=branch, pid=os.getpid())
        a = dispatch(f"forge implement {t} c{cycle}", brief_implement(t, c, spec, cycle, defects), model,
                     worktree=f"{t.lower()}-c{cycle}", base=c["base"], branch=branch)
        s3 = load_state(t); s3["stages"][-1]["agent"] = a; save_state(t, s3)
    watch(a, f"{t}-impl-c{cycle}", t, "implement")
    print(f"dispatched {a} on {branch} ({model}); waiting up to {c['stage_timeout_s']['implement']}s…")
    wt = None
    for _ in range(20):                                   # worktree appears a few seconds after dispatch
        wt = next(iter(Path.home().glob(f".paseo/worktrees/*/{t.lower()}-c{cycle}")), None)
        if wt: break
        time.sleep(3)
    _finish_implement(t, c, n, a, cycle, model, branch, spec, wt, head_before)

def _finish_implement(t, c, n, a, cycle, model, branch, spec, wt, head_before):
    """Wait for implementer `a` and record the outcome. Called by cmd_implement, and by `forge adopt`
    when a driver restart orphaned the original forge process."""
    d = wait_idle(a, c["stage_timeout_s"]["implement"], worktree=wt, on_question=answer_question(t, c, spec))
    if d.get("_answered"): record(t, "implement", "note", cycle=cycle, questions_answered=d["_answered"])
    head_after = sh(["git", "ls-remote", "origin", f"refs/heads/{branch}"], check=False).stdout.split()[:1]
    prs = json.loads(gh(["pr", "list", "--head", branch, "--json", "number,url,isDraft,state"], c["repo"]).stdout)
    if prs and prs[0]["isDraft"] and head_before and head_after == head_before:
        # Draft PR exists but this cycle pushed nothing. The agent did not work (or delegated the work away).
        record(t, "implement", "fail", agent=a, cycle=cycle, reason="draft PR unchanged: no commits pushed this cycle")
        comment(n, c["repo"], f"### forge · implement c{cycle} → **FAIL (no progress)**\n\nBranch head unchanged at `{head_after[0][:8]}`. Agent went idle without pushing.\n\n```\n{logs_tail(a, 15)}\n```")
        die(f"implementer {a} pushed nothing to {branch} — cycle wasted")
    if not prs:
        tail = logs_tail(a, 12)
        wt = next(iter(Path.home().glob(f".paseo/worktrees/*/{t.lower()}-c{cycle}")), None)
        blocker = (wt / ".forge-blocker.md") if wt else None
        if (blocker and blocker.exists()) or re.search(r"prerequisite blocker|BLOCKED:|spec (gap|omits|amendment)", tail, re.I):
            btxt = blocker.read_text() if blocker and blocker.exists() else tail
            (repo_root() / f".forge/{t}.blocker-c{cycle}.md").write_text(btxt)
            # The implementer found the spec incomplete and stopped rather than invent. That is a SPEC
            # defect, not an implementation failure: re-arm spec so the orchestrator can amend, keep the cycle.
            record(t, "implement", "blocked", agent=a, cycle=cycle, reason="implementer reported spec gap")
            s2 = load_state(t); s2["cycle"] = cycle - 1; save_state(t, s2)
            comment(n, c["repo"], f"### forge · implement c{cycle} → **BLOCKED on spec gap**\n\nImplementer stopped rather than invent. Orchestrator must amend `.forge/{t}.spec.md`, then re-run implement.\n\n```\n{btxt[:3000]}\n```")
            die(f"implementer {a} reported a spec gap — amend .forge/{t}.spec.md then re-run `forge implement {n}`")
        record(t, "implement", "fail", agent=a, cycle=cycle, reason="no PR opened")
        die(f"no PR on {branch}. Salvage: `git -C <worktree> status`; `paseo logs {a} | tail -40`\n{tail}")
    pr = prs[0]
    if pr["isDraft"]:
        # Budget ran out with real, green, committed work. Not a failure: the next cycle CONTINUES this branch.
        record(t, "implement", "partial", agent=a, cycle=cycle, pr=pr["number"], pr_url=pr["url"], branch=branch)
        record(t, "spec", "pass", note=f"re-armed: continue c{cycle} draft PR #{pr['number']} on {branch}")
        comment(n, c["repo"], f"### forge · implement (cycle {cycle}, `{model}`) → **PARTIAL (draft)**\n\nPR: {pr['url']} — budget reached with committed green work. Next cycle continues on `{branch}`.\n\n<details><summary>agent tail</summary>\n\n```\n{logs_tail(a, 30)}\n```\n</details>")
        print(f"{t} implement c{cycle} → PARTIAL draft {pr['url']} (will continue)")
        return
    record(t, "implement", "pass", agent=a, cycle=cycle, pr=pr["number"], pr_url=pr["url"], branch=branch)
    comment(n, c["repo"], f"### forge · implement (cycle {cycle}, `{model}`)\n\nPR: {pr['url']}\n\n<details><summary>agent tail</summary>\n\n```\n{logs_tail(a, 30)}\n```\n</details>")
    set_stage_label(n, c["repo"], "review")
    print(f"{t} implement c{cycle} → {pr['url']}")

def cmd_review(args):
    c = cfg(); n = args[0]; t = ticket_id(c, n); _lk = _lock(t); gate(t, "implement", this="review")
    s = load_state(t); cycle = s["cycle"]
    impl = next(st for st in reversed(s["stages"]) if st["stage"] == "implement" and st["status"] == "pass")
    # Orphan-reaped / orchestrator-recorded passes may lack model/pr: inherit from the nearest implement entry that has them.
    for k in ("model", "pr", "branch"):
        if not impl.get(k):
            donor = next((st for st in reversed(s["stages"]) if st["stage"] == "implement" and st.get(k)), None)
            if donor: impl[k] = donor[k]
    if not impl.get("pr"): die(f"{t}: no PR recorded on any implement entry — cannot review")
    # Reviewer is chosen to be a DIFFERENT family from whoever implemented this cycle.
    impl_fam = family(impl.get("model") or "")
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
    c = cfg(); n = args[0]; t = ticket_id(c, n); _lk = _lock(t); gate(t, "review", this="merge-gate")
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


def cmd_adopt(args):
    """forge adopt <issue#> <agent_id> — re-attach to a running implementer whose forge process died."""
    c = cfg(); n = args[0]; a = args[1]; t = ticket_id(c, n); _lk = _lock(t)
    s = load_state(t)
    run = next((st for st in reversed(s["stages"]) if st["stage"] == "implement" and st["status"] == "running"), None)
    if not run: die(f"{t}: no implement stage is 'running' — nothing to adopt")
    cycle, model, branch = run["cycle"], run["model"], run["branch"]
    wt = next(iter(Path.home().glob(f".paseo/worktrees/*/{t.lower()}-c{cycle}")), None)
    spec = spec_path(t).read_text()
    # head_before: the head at dispatch time is unknown; use the PR's base-most commit we know = current head only if no
    # new commits yet. Conservative: treat current remote head as "before" so a push during our watch counts as progress.
    head_before = sh(["git", "ls-remote", "origin", f"refs/heads/{branch}"], check=False).stdout.split()[:1]
    s["stages"][-1]["agent"] = a; s["stages"][-1]["adopted"] = True; save_state(t, s)
    print(f"adopted {a} for {t} c{cycle} on {branch}; watching…")
    _finish_implement(t, c, n, a, cycle, model, branch, spec, wt, head_before)

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
          "review": cmd_review, "merge": cmd_merge, "adopt": cmd_adopt, "status": cmd_status, "drain": cmd_drain}.get(cmd)
    if fn is None:
        die(f"unknown command {cmd}\n{__doc__}")
        return
    fn(args)

if __name__ == "__main__":
    main()
