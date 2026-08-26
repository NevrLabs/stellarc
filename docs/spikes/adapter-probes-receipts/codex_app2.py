#!/usr/bin/env python3
"""codex app-server probe v2: thread/start + turn/start (+ turn/steer)."""
import json, subprocess, sys, threading, time, os

MODE = sys.argv[1] if len(sys.argv) > 1 else "basic"  # basic | steer
LOG = open(os.environ.get("PROBE_LOG", "/tmp/adapter-probes/codex-app2.jsonl"), "w")
KEY = subprocess.run(["python3","-c","import yaml;print(yaml.safe_load(open('/home/rpw/.hermes/config.yaml'))['providers']['9router']['api_key'])"],capture_output=True,text=True).stdout.strip()
env = dict(os.environ, OPENAI_API_KEY=KEY)

cmd = ["codex", "app-server",
  "-c", 'model_providers.probe9={name="probe9", base_url="http://127.0.0.1:20128/v1", env_key="OPENAI_API_KEY", wire_api="responses"}',
  "-c", 'model_provider="probe9"', "-c", 'model="gpt-mini"']
p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, bufsize=1, env=env)

def send(obj):
    line = json.dumps(obj)
    LOG.write(f"-> {line}\n"); LOG.flush()
    p.stdin.write(line + "\n"); p.stdin.flush()

events, results, notes = {}, {}, []
def ev(i):
    return events.setdefault(i, threading.Event())
turn_completed = threading.Event()

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
        mid = msg.get("id")
        if mid is not None and ("result" in msg or "error" in msg):
            results[mid] = msg; ev(mid).set()
        elif "method" in msg:
            notes.append(msg["method"])
            if msg["method"] in ("turn/completed","turn.completed"):
                turn_completed.set()
            if mid is not None:
                send({"jsonrpc":"2.0","id":mid,"result":{"decision":"approved"}})

threading.Thread(target=reader, daemon=True).start()

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"stellarc-probe","title":"probe","version":"0.0.1"}}})
ev(1).wait(20)
send({"jsonrpc":"2.0","id":2,"method":"thread/start","params":{"cwd":"/tmp/adapter-probes","approvalPolicy":"never","sandboxPolicy":{"mode":"read-only"}}})
if not ev(2).wait(30):
    print("thread/start: no response"); p.kill(); sys.exit(1)
print("thread/start:", json.dumps(results.get(2,{}))[:500])
tid = (results[2].get("result") or {}).get("threadId") or (results[2].get("result") or {}).get("thread",{}).get("id")
print("threadId:", tid)
text = "Reply with exactly: PONG" if MODE == "basic" else "Count from 1 to 40, one number per line. No tools."
send({"jsonrpc":"2.0","id":3,"method":"turn/start","params":{"threadId":tid,"input":[{"type":"text","text":text}]}})
if MODE == "steer":
    if not ev(3).wait(20):
        print("turn/start no ack"); p.kill(); sys.exit(1)
    turn_id = results[3]["result"]["turn"]["id"]
    time.sleep(3)
    send({"jsonrpc":"2.0","id":4,"method":"turn/steer","params":{"threadId":tid,"expectedTurnId":turn_id,"input":[{"type":"text","text":"STEER: stop counting, reply STEERED only."}]}})
    ev(4).wait(20)
    print("turn/steer:", json.dumps(results.get(4,{}))[:300])
ok3 = ev(3).wait(90)
print("turn/start resolved:", ok3, json.dumps(results.get(3,{}))[:400])
turn_completed.wait(10)
print("notifications:", sorted(set(notes)))
p.terminate()
LOG.close()
