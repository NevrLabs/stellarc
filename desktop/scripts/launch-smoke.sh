#!/usr/bin/env bash
# Linux launch smoke (T05): run a bundled desktop binary under xvfb, assert the
# structured startup lines (window-created, health-probe) appear on stderr, then
# SIGTERM the process and assert it exits without needing SIGKILL.
set -euo pipefail

binary="${1:-}"
if [[ -z "$binary" ]]; then
	echo "usage: $0 <path-to-desktop-binary>" >&2
	exit 2
fi

log="$(mktemp)"
pid=""

cleanup() {
	if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
		kill -9 "$pid" 2>/dev/null || true
	fi
	rm -f "$log"
}
trap cleanup EXIT

# xvfb-run supplies the X display the GTK/WebKitGTK shell needs headless.
xvfb-run -a "$binary" >"$log" 2>&1 &
pid=$!

deadline=$((SECONDS + 30))
created=0
while ((SECONDS < deadline)); do
	if grep -q "event=window-created" "$log"; then
		created=1
		break
	fi
	sleep 1
done

if [[ "$created" != 1 ]]; then
	echo "FAIL: window-created line never appeared" >&2
	cat "$log" >&2
	exit 1
fi

if ! grep -q "event=health-probe" "$log"; then
	echo "FAIL: health-probe line never appeared" >&2
	cat "$log" >&2
	exit 1
fi

# SIGTERM must terminate the shell cleanly (no SIGKILL fallback needed).
kill -TERM "$pid"
for _ in $(seq 1 10); do
	if ! kill -0 "$pid" 2>/dev/null; then
		break
	fi
	sleep 1
done
if kill -0 "$pid" 2>/dev/null; then
	echo "FAIL: process still alive after SIGTERM" >&2
	exit 1
fi

echo "PASS: window-created + health-probe logged; clean SIGTERM exit"
