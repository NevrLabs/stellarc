#!/usr/bin/env bash
# Offline collector fixture: prove baseline-vs-proposed retention behavior with
# the actual maple collector binary (otelcol-maple-agent 0.164.0-fx1, copied
# read-only from talos /usr/local/bin/otelcol-maple-agent, sha256 b8a190d1...).
# Runs entirely on 127.0.0.1 in this directory. No Maple/ClickHouse/ingest touch.
# Retained records are observed via the compiled-in debug exporter (detailed);
# dropped records never reach it.
set -euo pipefail
cd "$(dirname "$0")"

BIN=./otelcol-maple-agent
RECV=43119

echo "== binary =="
"$BIN" --version
sha256sum "$BIN"

echo "== cases =="
python3 gen_cases.py

echo "== yaml + collector validate =="
python3 - <<'PY' || exit 1
import subprocess
for f in ("config-baseline.yaml", "config-proposed.yaml"):
    r = subprocess.run(["./otelcol-maple-agent", "validate", "--config", f],
                       capture_output=True, text=True)
    print(f, "collector validate exit", r.returncode)
    if r.returncode != 0:
        print((r.stderr or r.stdout)[:600]); raise SystemExit(1)
PY

wait_port() {
  for _ in $(seq 1 60); do
    if ! kill -0 "$COL_PID" 2>/dev/null; then echo "collector exited early" >&2; return 1; fi
    if curl -s -o /dev/null -X POST "http://127.0.0.1:$1/v1/logs" \
         -H 'content-type: application/json' -d '{"resourceLogs":[]}'; then
      return 0
    fi
    sleep 0.25
  done
  echo "port $1 never came up" >&2; return 1
}

run_config() { # $1 config, $2 log
  : > "$2"
  "$BIN" --config "$1" >"$2" 2>&1 &
  COL_PID=$!
  if ! wait_port "$RECV"; then echo "-- collector failed; log head:"; head -30 "$2"; exit 1; fi
  python3 send_cases.py "$RECV"
  sleep 2          # no batch processor: debug export is immediate
  kill "$COL_PID" 2>/dev/null || true; wait "$COL_PID" 2>/dev/null || true
  echo "-- $2: $(grep -c 'LogRecord #' "$2") exported records"
}

echo "== baseline (deployed predicate) =="
run_config config-baseline.yaml collector-baseline.log
echo "== proposed (predicate + stellarc audit exception) =="
run_config config-proposed.yaml collector-proposed.log

echo "== verdict =="
python3 check.py
