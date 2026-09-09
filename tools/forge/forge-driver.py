#!/usr/bin/env python3
"""forge-driver — walk the ticket DAG through forge stages until every ticket is merged.

Runs as a systemd user service so it survives session compaction, daemon restarts,
and the orchestrator being asleep. It is MECHANICAL: it calls `forge <stage> <n>`
in dependency order, records outcomes, and escalates. It never edits code, never
overrides a verdict, never merges outside `forge merge`.

Loop (every tick):
  1. Read .forge/wave-map.json (key→issue#) and each issue's `Blocked by:` edges.
  2. For each ticket whose blockers are all `merged`, advance ONE stage:
       triage → spec → implement → review → (REWORK → implement) → merge → merged
  3. A stage failure is retried up to `retries` times; then the ticket is marked
     `escalated` and left alone until a human clears .forge/<T>.escalation.
  4. Max `parallel` tickets in implement/review at once (worktrees are cheap;
     gateway rate limits are not).
  5. Append every action to .forge/driver.log and ~/.forge-driver/events.jsonl.

Human controls (touch files):
  .forge/driver.pause              → driver idles, finishes nothing new
  .forge/<T>.escalation            → written by driver on give-up; delete to resume
  .forge/<T>.skip                  → driver treats T as merged for DAG purposes
"""
import json, os, re, subprocess, sys, time, datetime as dt
from pathlib import Path

REPO_ROOT = Path(os.environ.get("FORGE_REPO", "/home/rpw/repos/stellarc-dev"))
FORGE = Path.home() / ".local/bin/forge"
STATE_DIR = Path.home() / ".forge-driver"; STATE_DIR.mkdir(exist_ok=True)
EVENTS = STATE_DIR / "events.jsonl"
TICK_S = int(os.environ.get("FORGE_TICK", "120"))
PARALLEL = int(os.environ.get("FORGE_PARALLEL", "3"))
RETRIES = int(os.environ.get("FORGE_RETRIES", "2"))
STAGE_ORDER = ["triage", "spec", "implement", "review", "merge"]

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
def log(kind, ticket, detail=""):
    rec = {"at": now(), "kind": kind, "ticket": ticket, "detail": detail}
    with EVENTS.open("a") as f: f.write(json.dumps(rec) + "\n")
    with (REPO_ROOT / ".forge/driver.log").open("a") as f: f.write(f"{rec['at']} {kind:10} {ticket:8} {detail}\n")
    print(f"{kind:10} {ticket:8} {detail}", flush=True)

def env():
    e = dict(os.environ); e["PATH"] = f"{Path.home()}/.local/node/bin:{Path.home()}/.local/bin:/usr/local/bin:/usr/bin:/bin"
    return e

def gh(*a):
    r = subprocess.run(["gh", *a, "-R", cfg()["repo"]], capture_output=True, text=True, env=env(), timeout=60)
    return r.stdout if r.returncode == 0 else None

_cfg = None
def cfg():
    global _cfg
    if _cfg is None: _cfg = json.loads((REPO_ROOT / ".forge/config.json").read_text())
    return _cfg

def wave_map(): return json.loads((REPO_ROOT / ".forge/wave-map.json").read_text())
def tid(n): return f"{cfg()['ticket_prefix']}-{n}"
def state(n):
    p = REPO_ROOT / f".forge/{tid(n)}.json"
    return json.loads(p.read_text()) if p.exists() else {"stages": [], "cycle": 0}
def last(s, stage):
    for st in reversed(s["stages"]):
        if st["stage"] == stage: return st["status"]
    return None

def blockers(n, key2num):
    """Parse `**Blocked by:** #a, #b` from the issue body; cached per tick."""
    out = gh("issue", "view", str(n), "--json", "body")
    if not out: return None
    m = re.search(r"\*\*Blocked by:\*\* (.*)", json.loads(out)["body"])
    return [int(x) for x in re.findall(r"#(\d+)", m.group(1))] if m else []

def is_done(n):
    s = state(n)
    return last(s, "merged") == "pass" or (REPO_ROOT / f".forge/{tid(n)}.skip").exists()

def next_stage(n):
    """Which forge command should run next for ticket n, or None if waiting/done/escalated."""
    if (REPO_ROOT / f".forge/{tid(n)}.escalation").exists(): return None
    s = state(n)
    if last(s, "merged") == "pass": return None
    if last(s, "merge-gate") == "pass": return None                    # merged is recorded by forge merge itself
    if last(s, "review") == "pass": return "merge"
    if last(s, "review") == "rework": return "implement"                # forge re-armed spec; cycle bumps inside
    if last(s, "implement") == "pass": return "review"
    if last(s, "spec") == "pass": return "implement"
    if last(s, "triage") == "pass": return "spec"
    tri = last(s, "triage")
    if tri in (None, "fail"): return "triage"
    return None                                                         # blocked / rejected / running

def failures(n, stage):
    return sum(1 for st in state(n)["stages"] if st["stage"] == stage and st["status"] == "fail")

def in_flight_count(nums):
    return sum(1 for n in nums if last(state(n), "implement") == "running" or last(state(n), "review") == "running")

def run_stage(n, stage):
    t = tid(n); log("start", t, stage)
    r = subprocess.run([str(FORGE), stage, str(n)], cwd=REPO_ROOT, env=env(), capture_output=True, text=True,
                       timeout=cfg()["stage_timeout_s"].get(stage, 3600) + 600)
    tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
    if r.returncode == 0:
        log("ok", t, f"{stage}: {' | '.join(tail)}")
    else:
        log("fail", t, f"{stage} rc={r.returncode}: {' | '.join(tail)}")
        if failures(n, stage) >= RETRIES or "exceeded" in (r.stdout + r.stderr):
            (REPO_ROOT / f".forge/{t}.escalation").write_text(f"{now()} {stage} failed {failures(n, stage)}x\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}\n")
            log("escalate", t, f"{stage} — human needed; delete .forge/{t}.escalation to resume")
            gh("issue", "comment", str(n), "--body", f"### forge-driver · **ESCALATED** at `{stage}`\n\nFailed {failures(n, stage)}× — driver has stopped touching this ticket. Delete `.forge/{t}.escalation` after fixing to resume.\n\n```\n{' | '.join(tail)}\n```")
    # forge commits stage files on spec/review; make sure state changes reach origin
    subprocess.run(["git", "push", "-q", "origin", cfg()["base"]], cwd=REPO_ROOT, env=env(), capture_output=True)
    return r.returncode == 0

def tick():
    if (REPO_ROOT / ".forge/driver.pause").exists():
        log("paused", "-", "driver.pause present"); return
    subprocess.run(["git", "pull", "-q", "--ff-only", "origin", cfg()["base"]], cwd=REPO_ROOT, env=env(), capture_output=True)
    wm = wave_map(); nums = sorted(wm.values())
    ready = []
    for n in nums:
        if is_done(n): continue
        bl = blockers(n, wm)
        if bl is None: continue
        if all(is_done(b) for b in bl):
            st = next_stage(n)
            if st: ready.append((n, st))
    # Parked questions need a human/orchestrator answer; announce them every tick until answered.
    for qf in sorted((REPO_ROOT / ".forge").glob("*.question-*.md")):
        af = qf.with_name(qf.name.replace(".question-", ".answer-"))
        if not af.exists(): log("question", qf.name.split(".")[0], f"unanswered → write {af.name}")
    if not ready:
        done = sum(is_done(n) for n in nums)
        log("idle", "-", f"{done}/{len(nums)} merged; nothing runnable (waiting on agents, blockers, or escalations)")
        return
    # throttle heavy stages
    heavy = in_flight_count(nums)
    for n, st in ready:
        if st in ("implement", "review") and heavy >= PARALLEL:
            log("throttle", tid(n), f"{st} deferred; {heavy} in flight"); continue
        ok = run_stage(n, st)
        if st in ("implement", "review"): heavy += 1
        if not ok and st == "triage": break   # a systemic triage failure is probably infra; don't spam

def main():
    log("boot", "-", f"repo={REPO_ROOT} tick={TICK_S}s parallel={PARALLEL}")
    while True:
        try: tick()
        except Exception as e: log("error", "-", f"{type(e).__name__}: {e}")
        time.sleep(TICK_S)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "once": tick()
    else: main()
