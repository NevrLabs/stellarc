#!/usr/bin/env python3
"""Steer probe: start a slow turn, then either session/cancel or a 2nd
session/prompt mid-turn. Logs all frames."""
import json, subprocess, sys, threading, time, os

CMD = sys.argv[1].split()
MODE = sys.argv[2]  # cancel | second-prompt
LOG = open(os.environ.get("PROBE_LOG", "/tmp/adapter-probes/steer.jsonl"), "w")

p = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, bufsize=1)

def send(obj):
    line = json.dumps(obj)
    LOG.write(f"-> {line}\n"); LOG.flush()
    p.stdin.write(line + "\n"); p.stdin.flush()

session_id = None
events = {}
def ev(i):
    return events.setdefault(i, threading.Event())

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
        mid = msg.get("id")
        if mid is not None and ("result" in msg or "error" in msg) :
            if mid == 2 and "result" in msg:
                session_id = msg["result"].get("sessionId")
            ev(mid).set()
        elif "method" in msg and mid is not None:
            m = msg["method"]
            resp = {"jsonrpc": "2.0", "id": mid}
            if "permission" in m.lower():
                opts = msg["params"].get("options", [])
                oid = opts[0]["optionId"] if opts else "allow"
                resp["result"] = {"outcome": {"outcome": "selected", "optionId": oid}}
            else:
                resp["result"] = {}
            send(resp)

threading.Thread(target=reader, daemon=True).start()

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":False,"writeTextFile":False}}}})
ev(1).wait(30)
send({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":os.getcwd(),"mcpServers":[]}})
ev(2).wait(30)
print("sessionId:", session_id)
send({"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":session_id,"prompt":[{"type":"text","text":"Run this exact shell command with your terminal tool: sleep 15 && echo done. Then reply DONE."}]}})
time.sleep(6)
if MODE == "cancel":
    send({"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":session_id}})
elif MODE == "second-prompt":
    send({"jsonrpc":"2.0","id":4,"method":"session/prompt","params":{"sessionId":session_id,"prompt":[{"type":"text","text":"STEER: stop sleeping, just reply STEERED."}]}})
ok3 = ev(3).wait(90)
print("turn1 finished:", ok3)
if MODE == "second-prompt":
    ok4 = ev(4).wait(60)
    print("turn2 finished:", ok4)
time.sleep(0.5)
p.terminate()
LOG.close()
