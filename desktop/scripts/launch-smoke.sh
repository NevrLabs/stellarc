#!/usr/bin/env bash
# Linux launch smoke (T05): run a bundled desktop binary under xvfb, assert the
# structured startup lines (window-created, health-probe) appear on stderr, then
# SIGTERM the process and assert it exits without needing SIGKILL.
#
# Rework D4: xvfb-run(1) execs the real binary (no persistent wrapper process),
# so the c1 script's "$pid" was already the app pid — but only by luck of that
# exec behavior. We no longer rely on it: $pid is verified to be the APP
# process via /proc/$pid/cmdline before any signal is sent, and a post-exit
# pgrep asserts no orphaned copy of the binary survived (the review's failure
# mode: app survives orphaned while the script still passes).
set -euo pipefail

binary="${1:-}"
if [[ -z "$binary" ]]; then
	echo "usage: $0 <path-to-desktop-binary>" >&2
	exit 2
fi

# Canonical absolute path of the app binary; pgrep matches on this exact value.
binary_abs="$(readlink -f "$binary")"
# Node/Electron-style process titles can diverge from argv[0]; pgrep -f on the
# abs path (not the shell wrapper) is what proves the app is really gone.
log="$(mktemp)"
pid=""
clean_exit=0

cleanup() {
	if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
		kill -9 "$pid" 2>/dev/null || true
	fi
	# Last-resort orphan sweep on any exit path.
	pkill -9 -f -e "$binary_abs" 2>/dev/null || true
	rm -f "$log"
}
trap cleanup EXIT

# xvfb-run supplies the X display the GTK/WebKitGTK shell needs headless.
xvfb-run -a "$binary" >"$log" 2>&1 &
pid=$!

# D4: prove $pid IS the app before asserting anything about its signals.
# xvfb-run is specified to exec the command, so $! must carry the app's
# cmdline; if it does not (wrapper changed, shell semantics changed), fail
# loudly instead of TERMing a wrapper while the app lives on.
for _ in $(seq 1 5); do
	if [[ -r "/proc/$pid/cmdline" ]] &&
		tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q -- "$binary_abs"; then
		break
	fi
	sleep 1
done
if ! (tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | grep -q -- "$binary_abs"); then
	echo "FAIL: pid $pid is not the app binary ($binary_abs) — refusing to smoke-test a wrapper" >&2
	exit 1
fi

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
		clean_exit=1
		break
	fi
	sleep 1
done
if [[ "$clean_exit" != 1 ]]; then
	echo "FAIL: app process (pid $pid) still alive after SIGTERM" >&2
	exit 1
fi

# D4: the assert that matters — no orphaned copy of the app survived the
# TERM. A surviving orphan here is exactly the failure the reviewer named.
sleep 1
if pgrep -f -- "$binary_abs" >/dev/null 2>&1; then
	echo "FAIL: orphaned app process survived SIGTERM:" >&2
	pgrep -af -- "$binary_abs" >&2 || true
	exit 1
fi

echo "PASS: window-created + health-probe logged; app pid $pid exited cleanly on SIGTERM; no orphaned app process"
