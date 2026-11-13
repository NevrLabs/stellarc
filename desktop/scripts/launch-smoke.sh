#!/usr/bin/env bash
# Linux launch smoke (T05): run a bundled desktop binary under xvfb, assert the
# structured startup lines (window-created, health-probe, log-file — the path
# of the persistent panic log, NEVR-632/NSH #1865) appear on stderr, then
# SIGTERM the process and assert it exits without needing SIGKILL.
#
# Rework D4: the app process is located directly (pgrep, mount-aware: an
# AppImage payload runs from /tmp/.mount_<…>/<bin>) and all signal/clean-exit
# asserts target THAT pid, never any wrapper around it.
#
# NEVR-328: the launch + startup-assert sequence gets exactly one bounded
# retry. The 2026-10-25 red (run 40173716961) was a one-off startup race —
# the app died before emitting a byte, so the existing `cat "$log"` printed
# nothing and a single flake red the job. Now: an attempt-1 failure prints
# WARN + the reason + the log's byte count + the full log, reaps that
# attempt's app/Xvfb processes (D4 holds between attempts), backs off 10 s
# and retries once; a second failure keeps the pre-existing FAIL semantics
# (job red). Every failure-path log dump is preceded by its byte count, so
# an empty log reads unambiguously as "app died pre-output".
# A green first attempt is byte-identical to the pre-retry script: same
# PASS line, no WARN, no retry artifacts.
#
# NEVR-470: deterministic X startup — no more `xvfb-run -a`. The 4 Foundation
# reds (runs 40745334942 / 40836669653 / 125015715814 / 41652777588, all
# push-to-dev, all this script's test, none touching Rust) were the
# xvfb-run auto-display probe dying before the client ran: attempt-1 WARN
# "app pid … died before creating a window" with a 0-byte app log — the
# stand-in app cannot fail, so the pid the poll matched was the wrapper/X
# chain collapsing, and NEVR-328's retry then converted its own recovery
# into a red via the no-WARN green-path contract. Fix at the source: the
# script owns the Xvfb lifecycle itself — `Xvfb -displayfd` picks a free
# display AND reports it only once the server sockets are bound (the
# race-free allocation xvfb-run approximates with its probe loop), the
# readiness wait polls pid liveness + the display report, and the binary
# runs bare under that DISPLAY (no wrapper pid to mistake for the app, D4
# gets simpler). No xauth cookie: -nolisten tcp + unix-socket host access
# is the standard bare-Xvfb CI posture (single-user runner) and drops a
# dependency xvfb-run used to drag in.
#
# Failure taxonomy (NEVR-470): every WARN/FAIL reason is prefixed with its
# mode so a recurrence is classifiable from the job log alone —
#   xvfb-startup: …            X-side death, startup or mid-attempt
#   app-death pre-window: …    app died (or never appeared) before
#                              event=window-created
#   app-death pre-probe: …     app died between window-created and
#                              event=health-probe
#   line never appeared: …     app alive, a required startup line timed out
# If Xvfb dies at ANY point in an attempt, the reason is rewritten to
# xvfb-startup (the X death is the root cause; the app dying after it is a
# consequence, not a mode of its own).
set -euo pipefail

binary="${1:-}"
if [[ -z "$binary" ]]; then
	echo "usage: $0 <path-to-desktop-binary>" >&2
	exit 2
fi

# Canonical absolute path (also makes pgrep argv matching unambiguous).
binary_abs="$(readlink -f "$binary")"
# Payload process name inside an AppImage mount (cargo bin name by default).
app_bin_name="${APP_BIN_NAME:-stellarc-desktop}"
log=""
xvfb_pid=""
xvfb_dir=""
display_num=""
FAIL_REASON=""

if ! command -v Xvfb >/dev/null 2>&1; then
	echo "FAIL: xvfb-startup: Xvfb not found in PATH" >&2
	exit 1
fi

# pids of the real app: cmdline is the binary path itself, or the mounted
# AppImage payload (…/.mount_*/<app_bin_name>).
find_app_pids() {
	{
		pgrep -f -- "$binary_abs" 2>/dev/null || true
		pgrep -f -- ".mount_.*${app_bin_name}" 2>/dev/null || true
	} | sort -u || true
}

log_bytes() {
	wc -c <"$log" | tr -d '[:space:]'
}

xvfb_log_bytes() {
	if [[ -f "$xvfb_dir/xvfb.err" ]]; then
		wc -c <"$xvfb_dir/xvfb.err" | tr -d '[:space:]'
	else
		echo 0
	fi
}

# NEVR-328: failure-path log dump, self-describing about emptiness — the byte
# count distinguishes "app died pre-output" (0 bytes) from a missing or
# unreadable log without re-pulling the workflow log.
dump_log() {
	echo "app log ($(log_bytes) bytes) follows:" >&2
	cat "$log" >&2
}

# NEVR-470: same byte-counted contract for the X server's own stderr, so an
# X-side death carries the server's (usually empty) log too.
dump_xvfb_log() {
	echo "xvfb stderr ($(xvfb_log_bytes) bytes) follows:" >&2
	if [[ -f "$xvfb_dir/xvfb.err" ]]; then
		cat "$xvfb_dir/xvfb.err" >&2 || true
	fi
}

# NEVR-470: deterministic X startup. Xvfb itself picks a free display via
# -displayfd and writes the number to fd 1 (the fifo) only once its sockets
# are bound — no auto-probe loop to race. Readiness = valid number read off
# the fifo while the pid stays alive.
start_xvfb() {
	xvfb_dir="$(mktemp -d)"
	mkfifo "$xvfb_dir/display"
	# fd 1 is the -displayfd report channel — deliberately the fifo, not the
	# console; Xvfb's own complaints go to the captured stderr file.
	Xvfb -displayfd 1 \
		-nolisten tcp -noreset \
		-screen 0 1280x1024x24 +extension RANDR +extension RENDER \
		>"$xvfb_dir/display" 2>"$xvfb_dir/xvfb.err" &
	xvfb_pid=$!
	exec 3<>"$xvfb_dir/display"

	local num="" deadline=$((SECONDS + 20))
	while :; do
		if read -t 1 -u 3 -r num && [[ "$num" =~ ^[0-9]+$ ]]; then
			display_num="$num"
			return 0
		fi
		if ! kill -0 "$xvfb_pid" 2>/dev/null; then
			FAIL_REASON="xvfb-startup: Xvfb pid $xvfb_pid died during startup"
			return 1
		fi
		if ((SECONDS >= deadline)); then
			FAIL_REASON="xvfb-startup: X server pid $xvfb_pid never reported a display number within 20s"
			return 1
		fi
		num=""
	done
}

stop_xvfb() {
	if [[ -n "$xvfb_pid" ]] && kill -0 "$xvfb_pid" 2>/dev/null; then
		kill -TERM "$xvfb_pid" 2>/dev/null || true
		for _ in $(seq 1 10); do
			if ! kill -0 "$xvfb_pid" 2>/dev/null; then
				break
			fi
			sleep 1
		done
		if kill -0 "$xvfb_pid" 2>/dev/null; then
			kill -9 "$xvfb_pid" 2>/dev/null || true
		fi
	fi
	xvfb_pid=""
	display_num=""
	# NB: no stderr suppression here — `exec 3>&- 2>/dev/null` would apply the
	# 2>/dev/null to the SHELL permanently and swallow every later WARN/FAIL.
	# Closing an unopened fd is a silent success in bash, so no guard needed
	# beyond set -e's own condition handling.
	exec 3>&- || true
	if [[ -n "$xvfb_dir" ]]; then
		rm -rf "$xvfb_dir" || true
		xvfb_dir=""
	fi
}

# NEVR-470 failure classifier: if the X server is dead, the X death is the
# root cause — name xvfb-startup and keep the observed consequence in
# parentheses, so even "kill Xvfb mid-attempt" self-classifies from the log.
# (Sets FAIL_REASON only — the caller returns 1 from its own condition
# context, so this must not fail under set -e.)
attempt_fail() {
	if ! kill -0 "$xvfb_pid" 2>/dev/null; then
		FAIL_REASON="xvfb-startup: Xvfb pid $xvfb_pid died mid-attempt ($1)"
	else
		FAIL_REASON="$1"
	fi
	return 0
}

# Reap one attempt's processes so nothing survives into the next attempt or
# past script exit (D4): the app first, then the X server this script owns
# (TERM, bounded wait, KILL), then the last-resort pattern sweeps.
kill_attempt() {
	if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
		kill -9 "$app_pid" 2>/dev/null || true
	fi
	stop_xvfb
	# Last-resort orphan sweep on any exit path.
	pkill -9 -f -- "$binary_abs" 2>/dev/null || true
	pkill -9 -f -- ".mount_.*${app_bin_name}" 2>/dev/null || true
}

cleanup() {
	kill_attempt
	if [[ -n "$log" ]]; then
		rm -f "$log" || true
	fi
}
trap cleanup EXIT

# NEVR-328: one launch attempt = deterministic X startup, spawn the binary
# bare under that DISPLAY, locate the real app pid, assert the structured
# startup lines (window-created, health-probe, log-file). State lives in the
# globals (log/xvfb_*/app_pid) so the caller can reap a failed attempt; on
# failure returns 1 with FAIL_REASON holding the mode-prefixed FAIL text.
launch_attempt() {
	app_pid=""
	log="$(mktemp)"

	if ! start_xvfb; then
		return 1
	fi

	DISPLAY=":$display_num" "$binary_abs" >"$log" 2>&1 &
	local spawn_pid=$!

	# Wait for the actual app process to exist (mount + exec can take a moment).
	local deadline=$((SECONDS + 30))
	while :; do
		local app_pids
		app_pids="$(find_app_pids)"
		if [[ -n "$app_pids" ]]; then
			app_pid="$(printf '%s\n' "$app_pids" | head -1)"
			break
		fi
		if ! kill -0 "$spawn_pid" 2>/dev/null; then
			attempt_fail "app-death pre-window: spawned process (pid $spawn_pid) exited before being located (looked for ${binary_abs} or .mount_*/${app_bin_name})"
			return 1
		fi
		if ((SECONDS >= deadline)); then
			attempt_fail "app-death pre-window: app process never appeared (looked for ${binary_abs} or .mount_*/${app_bin_name})"
			return 1
		fi
		sleep 1
	done

	# WebKitGTK first init under xvfb (software GL) can be slow; 60s is ample.
	deadline=$((SECONDS + 60))
	local created=0
	while ((SECONDS < deadline)); do
		if grep -q "event=window-created" "$log"; then
			created=1
			break
		fi
		if ! kill -0 "$app_pid" 2>/dev/null; then
			attempt_fail "app-death pre-window: app pid $app_pid died before creating a window"
			return 1
		fi
		sleep 1
	done

	if [[ "$created" != 1 ]]; then
		attempt_fail "line never appeared: window-created (app pid $app_pid still alive)"
		return 1
	fi

	# Rework defect 4: the probe runs off-thread with a 2 s timeout, so a
	# slow-but-alive origin can log AFTER window-created - poll with the same
	# deadline pattern as window-created instead of grepping once.
	deadline=$((SECONDS + 15))
	local probed=0
	while ((SECONDS < deadline)); do
		if grep -q "event=health-probe" "$log"; then
			probed=1
			break
		fi
		if ! kill -0 "$app_pid" 2>/dev/null; then
			attempt_fail "app-death pre-probe: app pid $app_pid died before the health-probe line"
			return 1
		fi
		sleep 1
	done

	if [[ "$probed" != 1 ]]; then
		attempt_fail "line never appeared: health-probe (app pid $app_pid still alive)"
		return 1
	fi

	# NEVR-632: the log-file line points at the persistent panic log
	# (NSH #1865). Setup emits it synchronously before building the window,
	# so it always precedes window-created — poll anyway, same pattern as the
	# other lines. Matching `path=/` (absolute) distinguishes the resolved
	# line from the status=unresolved fallback, which must fail this smoke.
	deadline=$((SECONDS + 15))
	local logged=0
	while ((SECONDS < deadline)); do
		if grep -q "event=log-file path=/" "$log"; then
			logged=1
			break
		fi
		if ! kill -0 "$app_pid" 2>/dev/null; then
			attempt_fail "app-death pre-log-file: app pid $app_pid died before the log-file line"
			return 1
		fi
		sleep 1
	done

	if [[ "$logged" != 1 ]]; then
		attempt_fail "line never appeared: log-file (app pid $app_pid still alive)"
		return 1
	fi
}

# NEVR-328: run the launch sequence at most twice — one bounded retry for a
# one-off startup race, then the pre-existing FAIL semantics (job red).
attempts=2
attempt=1
until launch_attempt; do
	if ((attempt >= attempts)); then
		echo "FAIL: $FAIL_REASON" >&2
		dump_log
		dump_xvfb_log
		exit 1
	fi
	echo "WARN: launch attempt $attempt failed ($FAIL_REASON); app log ($(log_bytes) bytes) follows:" >&2
	cat "$log" >&2
	dump_xvfb_log
	kill_attempt
	# D4 between attempts: nothing from the failed attempt may survive into
	# the retry — the sweep above must have reaped the app and the X server.
	orphans="$(find_app_pids)"
	if [[ -n "$orphans" ]]; then
		echo "FAIL: orphaned app process survived failed attempt $attempt:" >&2
		printf '%s\n' "$orphans" >&2
		exit 1
	fi
	app_pid=""
	if [[ -n "$log" ]]; then
		rm -f "$log" || true
	fi
	log=""
	echo "WARN: retrying launch in 10s (attempt $((attempt + 1)) of $attempts)" >&2
	sleep 10
	attempt=$((attempt + 1))
done

# SIGTERM must terminate the app cleanly (no SIGKILL fallback needed). This is
# the APP pid — never a wrapper (D4; with xvfb-run gone there is no wrapper
# pid left to mistake it for).
clean_exit=0
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

# Stop the X server this script owns now that its only client is gone, so
# nothing X-side survives past script exit either.
stop_xvfb

# D4: the assert that matters — no orphaned copy of the app survived, under
# either its original path or its AppImage mount path.
sleep 1
orphans="$(find_app_pids)"
if [[ -n "$orphans" ]]; then
	echo "FAIL: orphaned app process survived SIGTERM:" >&2
	printf '%s\n' "$orphans" >&2
	exit 1
fi

echo "PASS: window-created + health-probe + log-file logged; app pid $app_pid exited cleanly on SIGTERM; no orphaned app process"
