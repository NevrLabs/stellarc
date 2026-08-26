#!/usr/bin/env python3
"""Config probe: session/new with an mcpServers entry pointing at a marker
script (proves per-session MCP injection without host config). Then try
session/set_model. Then session/load (resume). No model turns."""
import json, subprocess, sys, threading, time, os

CMD = sys.argv[1].split()
LOAD_SID = sys.argv[2] if len(sys.argv) > 2 else None
LOG = open(os.environ.get("PROBE_LOG", "/tmp/adapter-probes/config.jsonl"), "w")
MARKER = "/tmp/adapter-probes/mcp-spawned.marker"
if os.path.exists(MARKER):
    os.unlink(MARKER)

p = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, bufsize=1)

def send(obj):
    line = json.dumps(obj)
    LOG.write(f"-> {line}\n"); LOG.flush()
    p.stdin.write(line + "\n"); p.stdin.flush()

session_id = None
events, results = {}, {}
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
        if mid is not None and ("result" in msg or "error" in msg):
            results[mid] = msg
            if mid == 2 and "result" in msg:
                session_id = msg["result"].get("sessionId")
            ev(mid).set()
        elif "method" in msg and mid is not None:
            send({"jsonrpc": "2.0", "id": mid, "result": {}})

threading.Thread(target=reader, daemon=True).start()

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":False,"writeTextFile":False}}}})
ev(1).wait(30)
mcp = [{"name":"probe","command":"/bin/sh","args":["-c",f"touch {MARKER}; cat"],"env":[]}]
send({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":os.getcwd(),"mcpServers":mcp}})
ev(2).wait(60)
print("sessionId:", session_id)
time.sleep(3)
print("mcp marker exists:", os.path.exists(MARKER))
# model switch attempt (ACP unstable session/set_model)
send({"jsonrpc":"2.0","id":5,"method":"session/set_model","params":{"sessionId":session_id,"modelId":"9router:gpt-mini"}})
ev(5).wait(15)
print("set_model:", json.dumps(results.get(5, "no-response"))[:200])
# session/load of a prior session
if LOAD_SID:
    send({"jsonrpc":"2.0","id":6,"method":"session/load","params":{"sessionId":LOAD_SID,"cwd":os.getcwd(),"mcpServers":[]}})
    ev(6).wait(60)
    print("load:", json.dumps(results.get(6, "no-response"))[:300])
time.sleep(0.5)
p.terminate()
LOG.close()
