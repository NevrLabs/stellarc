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
PARALLEL = int(os.environ.get("FORGE_PARALLEL", "3"))          # implement + review in flight
LIGHT_PARALLEL = int(os.environ.get("FORGE_LIGHT_PARALLEL", "3"))  # triage + spec in flight (read-only, cheap)
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

def paseo_status(agent_id):
    if not agent_id: return ""
    try:
        r = subprocess.run(["paseo", "ls", "--json"], capture_output=True, text=True, env=env(), timeout=60)
        for a in json.loads(r.stdout or "[]"):
            if a["id"].startswith(agent_id): return a.get("status", "")
    except Exception: pass
    return "unknown"

def reap_orphans(n):
    """A 'running' implement whose watcher pid is dead means the forge process was killed (driver restart, OOM).
    If the agent itself is idle/completed, record its pushed head as a partial and release the ticket lock so the
    next tick continues from there instead of blocking forever."""
    p = REPO_ROOT / f".forge/{tid(n)}.json"
    if not p.exists(): return
    s = json.loads(p.read_text()); changed = False
    for x in s["stages"]:
        if x.get("stage") != "implement" or x.get("status") != "running" or not x.get("pid"): continue
        try: os.kill(x["pid"], 0); continue          # watcher alive → leave it
        except PermissionError: continue
        except ProcessLookupError: pass
        status = paseo_status(x.get("agent", ""))
        if status in ("running", "needs_input"): continue  # agent still working; adopt manually with `forge adopt`
        head = subprocess.run(["git", "ls-remote", "origin", f"refs/heads/{x.get('branch','')}"], capture_output=True, text=True, cwd=REPO_ROOT).stdout.split()[:1]
        x["status"] = "partial"; x["head"] = head[0][:8] if head else ""; x["reason"] = f"orphan running: watcher pid {x['pid']} dead, agent {status or 'gone'}; recorded by driver"
        log("orphan", tid(n), f"c{x.get('cycle')} watcher dead, agent {status or 'gone'}; partial @{x['head']}")
        changed = True
    if changed:
        p.write_text(json.dumps(s, indent=1) + "\n")
        lock = REPO_ROOT / f".forge/.{tid(n)}.lock"
        if lock.exists(): lock.unlink()

def is_done(n):
    s = state(n)
    return last(s, "merged") == "pass" or (REPO_ROOT / f".forge/{tid(n)}.skip").exists()

def next_stage(n):
    """Which forge command should run next for ticket n, or None if waiting/done/escalated."""
    if (REPO_ROOT / f".forge/{tid(n)}.escalation").exists(): return None
    s = state(n)
    # In flight? The LAST entry for any stage being 'running' means a forge process owns this ticket.
    # Re-arming a predecessor (spec: pass) must not make the driver dispatch a second implementer.
    if any(last(s, st) == "running" for st in ("triage", "spec", "implement", "review", "merge-gate")):
        return None
    if last(s, "merged") == "pass": return None
    if last(s, "merge-gate") == "pass": return None                    # merged is recorded by forge merge itself
    if last(s, "review") == "pass": return "merge"
    if last(s, "review") == "rework": return "implement"                # forge re-armed spec; cycle bumps inside
    if last(s, "implement") == "pass": return "review"
    if last(s, "spec") == "pass": return "implement"
    if last(s, "implement") == "blocked":
        li = next(x for x in reversed(s["stages"]) if x["stage"] == "implement")
        if "preflight" in str(li.get("reason", "")): return "implement"      # infra, not a spec gap: retry next tick
    if last(s, "triage") == "pass": return "spec"
    tri = last(s, "triage")
    if tri in (None, "fail"): return "triage"
    return None                                                         # blocked / rejected / running

def failures(n, stage):
    """Consecutive hard fails since the last progress on this stage. Spec gaps ('blocked') and
    budget stops ('partial') are progress or orchestrator cost, and reset the count."""
    k = 0
    for st in reversed(state(n)["stages"]):
        if st["stage"] != stage: continue
        if st["status"] == "fail": k += 1
        elif st["status"] in ("pass", "partial", "blocked"): break
    return k

def in_flight_count(nums, stages=("implement", "review")):
    return sum(1 for n in nums if any(last(state(n), st) == "running" for st in stages))

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
        reap_orphans(n)
        bl = blockers(n, wm)
        if bl is None: continue
        st = next_stage(n)
        if not st: continue
        # triage and spec are read-only against the repo and cheap (glm lanes): run them AHEAD of the
        # blockers so that when a predecessor merges, its dependants start implementing on the next tick.
        # Implement/review/merge need the predecessor's code on `dev`, so they still wait.
        if st in ("triage", "spec") or all(is_done(b) for b in bl):
            ready.append((n, st))
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
    light = in_flight_count(nums, stages=("triage", "spec"))
    for n, st in ready:
        if st in ("implement", "review"):
            if heavy >= PARALLEL: log("throttle", tid(n), f"{st} deferred; {heavy} heavy in flight"); continue
        elif light >= LIGHT_PARALLEL:
            log("throttle", tid(n), f"{st} deferred; {light} light in flight"); continue
        ok = run_stage(n, st)
        if st in ("implement", "review"): heavy += 1
        else: light += 1
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
