#!/usr/bin/env bash
# Linux launch smoke (T05): run a bundled desktop binary under xvfb, assert the
# structured startup lines (window-created, health-probe) appear on stderr, then
# SIGTERM the process and assert it exits without needing SIGKILL.
#
# Rework D4: xvfb-run is a shell script and (on Debian) never execs the client —
# its pid stays "/bin/sh xvfb-run …" forever, with Xvfb and the app as children.
# TERMing that wrapper pid (c1's behavior) can orphan the app while the script
# passes. So the app process is located directly (pgrep, mount-aware: an
# AppImage payload runs from /tmp/.mount_<…>/<bin>) and all signal/clean-exit
# asserts target THAT pid; the wrapper is only reaped afterwards.
set -euo pipefail

binary="${1:-}"
if [[ -z "$binary" ]]; then
	echo "usage: $0 <path-to-desktop-binary>" >&2
	exit 2
fi

# Canonical absolute path (also makes wrapper argv matching unambiguous).
binary_abs="$(readlink -f "$binary")"
# Payload process name inside an AppImage mount (cargo bin name by default).
app_bin_name="${APP_BIN_NAME:-stellarc-desktop}"
log="$(mktemp)"
wrapper_pid=""
app_pid=""

# pids of the real app: cmdline is the binary path itself, or the mounted
# AppImage payload (…/.mount_*/<app_bin_name>).
find_app_pids() {
	{
		pgrep -f -- "$binary_abs" 2>/dev/null || true
		pgrep -f -- ".mount_.*${app_bin_name}" 2>/dev/null || true
	} | sort -u | grep -v -x -F "$wrapper_pid" || true
}

cleanup() {
	if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
		kill -9 "$app_pid" 2>/dev/null || true
	fi
	if [[ -n "$wrapper_pid" ]] && kill -0 "$wrapper_pid" 2>/dev/null; then
		kill -9 "$wrapper_pid" 2>/dev/null || true
	fi
	# Last-resort orphan sweep on any exit path.
	pkill -9 -f -- "$binary_abs" 2>/dev/null || true
	pkill -9 -f -- ".mount_.*${app_bin_name}" 2>/dev/null || true
	rm -f "$log"
}
trap cleanup EXIT

# xvfb-run supplies the X display the GTK/WebKitGTK shell needs headless.
xvfb-run -a "$binary_abs" >"$log" 2>&1 &
wrapper_pid=$!

# Wait for the actual app process to exist (mount + exec can take a moment).
deadline=$((SECONDS + 30))
while :; do
	app_pids="$(find_app_pids)"
	if [[ -n "$app_pids" ]]; then
		app_pid="$(printf '%s\n' "$app_pids" | head -1)"
		break
	fi
	if ((SECONDS >= deadline)); then
		echo "FAIL: app process never appeared under xvfb (looked for ${binary_abs} or .mount_*/${app_bin_name})" >&2
		tail -8 "$log" >&2 || true
		exit 1
	fi
	sleep 1
done

deadline=$((SECONDS + 30))
created=0
while ((SECONDS < deadline)); do
	if grep -q "event=window-created" "$log"; then
		created=1
		break
	fi
	if ! kill -0 "$app_pid" 2>/dev/null; then
		echo "FAIL: app pid $app_pid died before creating a window" >&2
		cat "$log" >&2
		exit 1
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

# SIGTERM must terminate the app cleanly (no SIGKILL fallback needed). This is
# the APP pid — not the xvfb-run wrapper (that is the D4 defect).
kill -TERM "$app_pid"
for _ in $(seq 1 10); do
	if ! kill -0 "$app_pid" 2>/dev/null; then
		clean_exit=1
		break
	fi
	sleep 1
done
if [[ "$clean_exit" != 1 ]]; then
	echo "FAIL: app process (pid $app_pid) still alive after SIGTERM" >&2
	exit 1
fi

# Reap the wrapper (it exits once its client is gone) so the orphan sweep
# below cannot mistake its argv for a surviving app.
if kill -0 "$wrapper_pid" 2>/dev/null; then
	kill -TERM "$wrapper_pid" 2>/dev/null || true
	for _ in $(seq 1 10); do
		kill -0 "$wrapper_pid" 2>/dev/null || break
		sleep 1
	done
fi

# D4: the assert that matters — no orphaned copy of the app survived, under
# either its original path or its AppImage mount path.
sleep 1
orphans="$(find_app_pids)"
if [[ -n "$orphans" ]]; then
	echo "FAIL: orphaned app process survived SIGTERM:" >&2
	printf '%s\n' "$orphans" >&2
	exit 1
fi

echo "PASS: window-created + health-probe logged; app pid $app_pid exited cleanly on SIGTERM; no orphaned app process"
