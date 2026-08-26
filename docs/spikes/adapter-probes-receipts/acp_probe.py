#!/usr/bin/env python3
"""Minimal ACP stdio driver: initialize -> session/new -> session/prompt.
Logs every frame both ways. Optionally cancels mid-turn (--cancel)."""
import json, subprocess, sys, threading, time, os

CMD = sys.argv[1].split()  # e.g. "hermes acp"
CANCEL = "--cancel" in sys.argv
PROMPT = os.environ.get("PROBE_PROMPT", "Reply with exactly: PONG")
LOG = open(os.environ.get("PROBE_LOG", "/tmp/adapter-probes/frames.jsonl"), "w")

p = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, bufsize=1)
seq = 0
def send(method, params, id=None):
    global seq
    msg = {"jsonrpc": "2.0", "method": method, "params": params}
    if id is not None:
        msg["id"] = id
    line = json.dumps(msg)
    LOG.write(f"-> {line}\n"); LOG.flush()
    p.stdin.write(line + "\n"); p.stdin.flush()

pending = {}
session_id = None
turn_done = threading.Event()
init_done = threading.Event()
new_done = threading.Event()

def reader():
    global session_id
    for line in p.stdout:
        line = line.strip()
        if not line:
            continue
        LOG.write(f"<- {line}\n"); LOG.flush()
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if msg.get("id") == 1:
            init_done.set()
        elif msg.get("id") == 2 and "result" in msg:
            session_id = msg["result"].get("sessionId")
            new_done.set()
        elif msg.get("id") == 3:
            turn_done.set()
        elif "method" in msg and msg.get("id") is not None:
            # server->client request (e.g. permission): reply with first option / allow
            m = msg["method"]
            resp = {"jsonrpc": "2.0", "id": msg["id"]}
            if "permission" in m.lower():
                opts = msg["params"].get("options", [])
                oid = opts[0]["optionId"] if opts else "allow"
                resp["result"] = {"outcome": {"outcome": "selected", "optionId": oid}}
            else:
                resp["result"] = {}
            out = json.dumps(resp)
            LOG.write(f"-> {out}\n"); LOG.flush()
            p.stdin.write(out + "\n"); p.stdin.flush()

t = threading.Thread(target=reader, daemon=True)
t.start()

send("initialize", {"protocolVersion": 1, "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}}}, id=1)
if not init_done.wait(30):
    print("FAIL: no initialize response"); p.kill(); sys.exit(1)
send("session/new", {"cwd": os.getcwd(), "mcpServers": []}, id=2)
if not new_done.wait(30):
    print("FAIL: no session/new response"); p.kill(); sys.exit(1)
print("sessionId:", session_id)
send("session/prompt", {"sessionId": session_id, "prompt": [{"type": "text", "text": PROMPT}]}, id=3)
if CANCEL:
    time.sleep(2)
    send("session/cancel", {"sessionId": session_id})
if not turn_done.wait(120):
    print("FAIL: no prompt response within 120s")
else:
    print("turn completed (id=3 response received)")
time.sleep(0.5)
p.terminate()
LOG.close()
