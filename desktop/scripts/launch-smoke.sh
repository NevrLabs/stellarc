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
#
# NEVR-328: the launch + startup-assert sequence gets exactly one bounded
# retry. The 2026-10-25 red (run 40173716961) was a one-off startup race —
# the app died before emitting a byte, so the existing `cat "$log"` printed
# nothing and a single flake red the job. Now: an attempt-1 failure prints
# WARN + the reason + the log's byte count + the full log, reaps that
# attempt's app/wrapper/Xvfb processes (D4 holds between attempts), backs
# off 10 s and retries once; a second failure keeps the pre-existing FAIL
# semantics (job red). Every failure-path log dump is preceded by its byte
# count, so an empty log reads unambiguously as "app died pre-output".
# A green first attempt is byte-identical to the pre-retry script: same
# PASS line, no WARN, no retry artifacts.
#
# NEVR-378: xvfb-run is itself a shell script, and the subshell it forks to
# exec Xvfb — `(trap '' USR1; exec Xvfb …) &` — keeps the WRAPPER's argv
# ("…xvfb-run -a $binary") until the exec. A bare pgrep -f match could hand
# back that staging pid instead of the app's; when Xvfb died mid-attempt the
# script saw a phantom launch failure (WARN leaked into a green retry,
# run 40745334942), and when it died between the health-probe assert and the
# SIGTERM the bare `kill -TERM` crashed under set -e with no FAIL line
# (run 40834488557). find_app_pids now refuses wrapper-shaped pids, and an
# app that dies in that gap FAILs with the standard reason + byte-counted
# dump instead of crashing.
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
log=""
wrapper_pid=""
app_pid=""
FAIL_REASON=""

# pids of the real app: cmdline is the binary path itself, or the mounted
# AppImage payload (…/.mount_*/<app_bin_name>). NEVR-378: any pid whose argv
# still mentions the xvfb-run wrapper is the wrapper shell or its transient
# Xvfb-staging fork (both carry "…xvfb-run -a $binary"), never the app.
is_xvfb_wrapper_pid() {
	local cmdline
	cmdline="$(tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null)" || return 0
	[[ "$cmdline" == *xvfb-run* ]]
}

find_app_pids() {
	local pid
	{
		pgrep -f -- "$binary_abs" 2>/dev/null || true
		pgrep -f -- ".mount_.*${app_bin_name}" 2>/dev/null || true
	} | sort -u | while IFS= read -r pid; do
		if [[ "$pid" == "$wrapper_pid" ]]; then continue; fi
		if is_xvfb_wrapper_pid "$pid"; then continue; fi
		printf '%s\n' "$pid"
	done || true
}

log_bytes() {
	wc -c <"$log" | tr -d '[:space:]'
}

# NEVR-328: failure-path log dump, self-describing about emptiness — the byte
# count distinguishes "app died pre-output" (0 bytes) from a missing or
# unreadable log without re-pulling the workflow log.
dump_log() {
	echo "app log ($(log_bytes) bytes) follows:" >&2
	cat "$log" >&2
}

# Reap one attempt's processes so nothing survives into the next attempt or
# past script exit (D4): the app first — the wrapper exits once its client is
# gone and takes its Xvfb with it — then a TERM/KILL fallback on the wrapper
# itself, then any child a killed wrapper could no longer clean up after
# (tracked by ppid snapshot, so some sibling's Xvfb is never touched), then
# the last-resort pattern sweeps.
kill_attempt() {
	local pid wrapper_children
	if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
		kill -9 "$app_pid" 2>/dev/null || true
	fi
	if [[ -n "$wrapper_pid" ]] && kill -0 "$wrapper_pid" 2>/dev/null; then
		wrapper_children="$(pgrep -P "$wrapper_pid" 2>/dev/null || true)"
		kill -TERM "$wrapper_pid" 2>/dev/null || true
		for _ in $(seq 1 10); do
			kill -0 "$wrapper_pid" 2>/dev/null || break
			sleep 1
		done
		if kill -0 "$wrapper_pid" 2>/dev/null; then
			kill -9 "$wrapper_pid" 2>/dev/null || true
		fi
		for pid in $wrapper_children; do
			if kill -0 "$pid" 2>/dev/null; then
				kill -9 "$pid" 2>/dev/null || true
			fi
		done
	fi
	# Last-resort orphan sweep on any exit path.
	pkill -9 -f -- "$binary_abs" 2>/dev/null || true
	pkill -9 -f -- ".mount_.*${app_bin_name}" 2>/dev/null || true
}

cleanup() {
	kill_attempt
	[[ -n "$log" ]] && rm -f "$log" || true
}
trap cleanup EXIT

# NEVR-328: one launch attempt = spawn the wrapper, locate the real app pid,
# assert the two structured startup lines. State lives in the globals
# (log/wrapper_pid/app_pid) so the caller can reap a failed attempt; on
# failure returns 1 with FAIL_REASON holding the pre-existing FAIL text.
launch_attempt() {
	wrapper_pid=""
	app_pid=""
	log="$(mktemp)"

	# xvfb-run supplies the X display the GTK/WebKitGTK shell needs headless.
	xvfb-run -a "$binary_abs" >"$log" 2>&1 &
	wrapper_pid=$!

	# Wait for the actual app process to exist (mount + exec can take a moment).
	local deadline=$((SECONDS + 30))
	while :; do
		local app_pids
		app_pids="$(find_app_pids)"
		if [[ -n "$app_pids" ]]; then
			app_pid="$(printf '%s\n' "$app_pids" | head -1)"
			break
		fi
		if ((SECONDS >= deadline)); then
			FAIL_REASON="app process never appeared under xvfb (looked for ${binary_abs} or .mount_*/${app_bin_name})"
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
			FAIL_REASON="app pid $app_pid died before creating a window"
			return 1
		fi
		sleep 1
	done

	if [[ "$created" != 1 ]]; then
		FAIL_REASON="window-created line never appeared"
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
			FAIL_REASON="app pid $app_pid died before the health-probe line"
			return 1
		fi
		sleep 1
	done

	if [[ "$probed" != 1 ]]; then
		FAIL_REASON="health-probe line never appeared"
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
		exit 1
	fi
	echo "WARN: launch attempt $attempt failed ($FAIL_REASON); app log ($(log_bytes) bytes) follows:" >&2
	cat "$log" >&2
	kill_attempt
	# D4 between attempts: nothing from the failed attempt may survive into
	# the retry — the sweep above must have reaped the app and the wrapper.
	orphans="$(find_app_pids)"
	if [[ -n "$orphans" ]]; then
		echo "FAIL: orphaned app process survived failed attempt $attempt:" >&2
		printf '%s\n' "$orphans" >&2
		exit 1
	fi
	wrapper_pid=""
	app_pid=""
	[[ -n "$log" ]] && rm -f "$log" || true
	log=""
	echo "WARN: retrying launch in 10s (attempt $((attempt + 1)) of $attempts)" >&2
	sleep 10
	attempt=$((attempt + 1))
done

# SIGTERM must terminate the app cleanly (no SIGKILL fallback needed). This is
# the APP pid — not the xvfb-run wrapper (that is the D4 defect).
#
# NEVR-378: an app that dies in the gap between the health-probe assert and
# this TERM is not a clean launch — fail with the standard semantics (reason
# + byte-counted dump) instead of the bare `kill: No such process` crash
# set -e produced (run 40834488557).
clean_exit=0
if ! kill -TERM "$app_pid" 2>/dev/null; then
	echo "FAIL: app pid $app_pid died before SIGTERM (after health-probe)" >&2
	dump_log
	exit 1
fi
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
