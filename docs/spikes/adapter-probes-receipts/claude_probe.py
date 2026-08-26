#!/usr/bin/env python3
"""Claude Code stream-json probe. Modes: basic | steer | resume <sid>."""
import json, subprocess, sys, threading, time, os

MODE = sys.argv[1]
SID = sys.argv[2] if len(sys.argv) > 2 else None
LOG = open(os.environ.get("PROBE_LOG", "/tmp/adapter-probes/claude.jsonl"), "w")

cmd = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json",
       "--verbose", "--model", "haiku", "--allowedTools", "Bash",
       "--permission-mode", "dontAsk"]
if MODE == "resume":
    cmd += ["--resume", SID]

p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE, text=True, bufsize=1)

def user_msg(text):
    return json.dumps({"type": "user", "message": {"role": "user",
        "content": [{"type": "text", "text": text}]}})

def send(line):
    LOG.write(f"-> {line}\n"); LOG.flush()
    p.stdin.write(line + "\n"); p.stdin.flush()

results = []
def reader():
    for line in p.stdout:
        line = line.strip()
        if not line:
            continue
        LOG.write(f"<- {line}\n"); LOG.flush()
        try:
            msg = json.loads(line)
        except Exception:
            continue
        results.append(msg)

threading.Thread(target=reader, daemon=True).start()

if MODE == "basic":
    send(user_msg("Reply with exactly: PONG"))
elif MODE == "steer":
    send(user_msg("Run this bash command: sleep 15 && echo done. Then reply DONE."))
    time.sleep(6)
    send(user_msg("STEER: stop, just reply STEERED."))
elif MODE == "resume":
    send(user_msg("What was my previous message? One line."))

deadline = time.time() + 90
want = 2 if MODE == "steer" else 1
while time.time() < deadline:
    if sum(1 for m in results if m.get("type") == "result") >= want:
        break
    time.sleep(0.5)
p.stdin.close()
time.sleep(1)
p.terminate()
for m in results:
    t = m.get("type")
    if t == "system":
        print("system:", json.dumps({k: m.get(k) for k in ("subtype","session_id","model","mcp_servers","permissionMode")}))
    elif t == "result":
        print("result:", json.dumps({k: m.get(k) for k in ("subtype","session_id","result","num_turns","total_cost_usd")}))
    elif t == "assistant":
        txt = "".join(c.get("text","") for c in m["message"].get("content",[]) if isinstance(c,dict) and c.get("type")=="text")
        if txt:
            print("assistant:", txt[:120])
LOG.close()
