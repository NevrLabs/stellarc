#!/usr/bin/env python3
"""forge-status: one-screen view of the pipeline. Safe to run any time."""
import json, os, re, subprocess, sys, glob
from pathlib import Path
R = Path(os.environ.get("FORGE_REPO", "/home/rpw/repos/stellarc-dev"))
H = Path.home()
env = dict(os.environ); env["PATH"] = f"{H}/.local/node/bin:{H}/.local/bin:" + env["PATH"]
for l in (H / ".paseo-env").read_text().splitlines():
    l = l.strip().removeprefix("export ")
    if "=" in l and not l.startswith("#"): k, v = l.split("=", 1); env[k] = v.strip().strip('"')
def sh(*a, **k): return subprocess.run(a, env=env, capture_output=True, text=True, **k).stdout

cfg = json.loads((R / ".forge/config.json").read_text()); pre = cfg["ticket_prefix"]
wm = json.loads((R / ".forge/wave-map.json").read_text())
agents = {a["id"]: a for a in json.loads(sh("paseo", "ls", "--json") or "[]")}

print(f"{'ticket':8} {'stage':11} {'status':8} cyc  agent/branch")
for key, n in sorted(wm.items(), key=lambda kv: kv[1]):
    p = R / f".forge/{pre}-{n}.json"
    if not p.exists(): print(f"{pre}-{n:<4} {'—':11} {'—':8}      [{key}] not started"); continue
    s = json.loads(p.read_text()); cur = s["stages"][-1] if s["stages"] else {}
    a = cur.get("agent", ""); ast = agents.get(a, {}).get("status", "") if a else ""
    extra = f"{cur.get('branch','')} {('agent:'+a[:8]+'='+ast) if a else ''}"
    print(f"{pre}-{n:<4} {cur.get('stage','—'):11} {cur.get('status','—'):8} {s.get('cycle',0):>3}  {extra}")

print("\n— live agents —")
for a in agents.values():
    if a.get("status") not in ("idle", "closed", "archived"):
        wt = a.get("cwd", "")
        q = (Path(os.path.expanduser(wt)) / ".forge-question.md") if wt else None
        flag = "  ❓ QUESTION PENDING" if q and q.exists() else ""
        print(f"  {a['id'][:8]} {a['status']:9} {wt}{flag}")

print("\n— parked questions / escalations —")
for f in sorted((R / ".forge").glob("*.question-*.md")):
    ans = f.with_name(f.name.replace(".question-", ".answer-"))
    print(f"  {f.name}  {'answered' if ans.exists() else 'UNANSWERED'}")
for f in sorted((R / ".forge").glob("*.escalation")): print(f"  ESCALATED {f.name}")

print("\n— worktrees —")
for wt in sorted(glob.glob(str(H / ".paseo/worktrees/*/stl-*"))):
    n = sh("git", "-C", wt, "status", "--short").count("\n")
    last = sh("git", "-C", wt, "log", "-1", "--format=%h %s", "--", ".").strip()[:70]
    print(f"  {Path(wt).name:12} {n:>3} changed  {last}")

print("\n— driver (last 5) —")
print(sh("journalctl", "--user", "-u", "forge-driver", "--since", "20 minutes ago", "--no-pager", "-o", "cat").strip().split("\n")[-5:] and
      "\n".join("  " + l for l in sh("journalctl", "--user", "-u", "forge-driver", "--since", "20 minutes ago", "--no-pager", "-o", "cat").strip().split("\n")[-5:]))
