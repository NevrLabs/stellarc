import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * NEVR-328 — launch-smoke.sh gets exactly one bounded launch retry, and every
 * failure-path log dump is preceded by the log's byte count. The 2026-10-25
 * linux-smoke red was a one-off startup race where the app died before
 * emitting anything: the job went red on the first attempt and the empty
 * `cat "$log"` was indistinguishable from "log not shown". Against the
 * pre-NEVR-328 script these tests fail: no WARN/retry is printed and no
 * byte-count marker exists.
 *
 * The script is driven with bash stand-in binaries (no desktop build needed)
 * and invoked with a RELATIVE app path from a scratch cwd, mirroring how the
 * workflow invokes it (`bash desktop/scripts/launch-smoke.sh "$bin"`) so the
 * script's own argv never matches its pgrep pattern.
 *
 * NEVR-378 — two more tests for the Foundation flake (2 of 4 dev-adjacent
 * runs red on the green-launch case). Root cause: xvfb-run is a shell script
 * and starts Xvfb via `(trap '' USR1; exec Xvfb …) &`; until the exec that
 * subshell carries the WRAPPER's argv (`…xvfb-run -a <app>`), so pgrep -f
 * "<app>" can hand the launcher the staging pid instead of the app's. When
 * Xvfb dies mid-attempt the script sees a phantom launch failure (WARN leak
 * into a green retry, run 40745334942); when it dies between the health-probe
 * assert and the SIGTERM, the bare `kill -TERM` crashes the script under
 * `set -e` with no FAIL line at all (run 40834488557).
 */

const repoRoot = join(import.meta.dir, "..", "..");
const script = join(repoRoot, "desktop", "scripts", "launch-smoke.sh");

const hasDeps =
	spawnSync("bash", ["-c", "command -v xvfb-run pgrep >/dev/null"]).status ===
	0;

function runSmoke(dir: string, app: string, env?: NodeJS.ProcessEnv) {
	const res = spawnSync("bash", [script, `./${app}`], {
		cwd: dir,
		encoding: "utf8",
		timeout: 150_000,
		env: env ?? process.env,
	});
	return { code: res.status ?? -1, out: `${res.stdout}\n${res.stderr}` };
}

function standIns() {
	const dir = mkdtempSync(join(tmpdir(), "launch-smoke-"));
	// Green stand-in: logs both startup lines, exits 0 on SIGTERM.
	writeFileSync(
		join(dir, "good-app"),
		[
			"#!/usr/bin/env bash",
			'echo "event=window-created"',
			'echo "event=health-probe"',
			"trap 'exit 0' TERM",
			"while :; do sleep 1 & wait $!; done",
			"",
		].join("\n"),
	);
	// Failing stand-in: starts (so the pid is found), logs one line, then dies
	// pre-window — the startup-race shape from the 10-25 red, with a non-empty
	// log so the dump itself is visible in the output.
	writeFileSync(
		join(dir, "race-death-app"),
		[
			"#!/usr/bin/env bash",
			'echo "stand-in: startup failed (simulated race)"',
			"sleep 3",
			"exit 1",
			"",
		].join("\n"),
	);
	// Gap-death stand-in (NEVR-378): both startup lines appear, then the app
	// dies BEFORE the launcher's SIGTERM can arrive — health-probe lands 1.5s
	// after window-created so the poll loops are past their liveness checks
	// when the death occurs, and the exit (~1ms after the probe echo) always
	// beats the TERM (which follows one more grep fork+exec, ≥5ms later).
	writeFileSync(
		join(dir, "gap-death-app"),
		[
			"#!/usr/bin/env bash",
			'echo "event=window-created"',
			"sleep 1.5",
			'echo "event=health-probe"',
			"exit 0",
			"",
		].join("\n"),
	);
	for (const app of ["good-app", "race-death-app", "gap-death-app"]) {
		chmodSync(join(dir, app), 0o755);
	}
	return dir;
}

// NEVR-378: PATH-shim stand-in for xvfb-run. The real one is a /bin/sh script
// whose Xvfb-staging subshell `(trap '' USR1; exec Xvfb …) &` keeps the
// wrapper argv — `…xvfb-run -a <app>` — until the exec, so pgrep -f "<app>"
// matches it. This shim forks one such transient wrapper-shaped pid (living
// ~2s, like an Xvfb that dies mid-run) and then runs the client as a child,
// exactly like the real script's `"$@"` foreground client.
function xvfbRunShim(dir: string) {
	writeFileSync(
		join(dir, "xvfb-run"),
		[
			"#!/usr/bin/env bash",
			"# NEVR-378 stand-in wrapper: transient wrapper-shaped pid + real client.",
			'if [[ "$1" == "-a" ]]; then shift; fi',
			"( sleep 2; : ) &",
			"staging_pid=$!",
			'"$@"',
			"status=$?",
			'kill "$staging_pid" 2>/dev/null || true',
			'wait "$staging_pid" 2>/dev/null || true',
			'exit "$status"',
			"",
		].join("\n"),
	);
	chmodSync(join(dir, "xvfb-run"), 0o755);
}

const it = test.skipIf(!hasDeps);

it(
	"green launch: unchanged PASS line, no retry artifacts",
	() => {
		const dir = standIns();
		try {
			const { code, out } = runSmoke(dir, "good-app");
			expect(code, out).toBe(0);
			expect(out).toMatch(
				/^PASS: window-created \+ health-probe logged; app pid \d+ exited cleanly on SIGTERM; no orphaned app process$/m,
			);
			// The retry must be invisible on success.
			expect(out).not.toContain("WARN");
			expect(out).not.toContain("attempt 2");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	{ timeout: 90_000 },
);

it(
	"startup-race death: one WARN + retry, then FAIL with byte-counted log dump",
	() => {
		const dir = standIns();
		try {
			const { code, out } = runSmoke(dir, "race-death-app");
			expect(code, out).toBe(1);

			// Exactly one retry: attempt 1 warns (reason + byte count + full
			// log), attempt 2 keeps the pre-existing FAIL semantics.
			const warns = out.match(/WARN: launch attempt 1 failed \(/g) ?? [];
			expect(warns.length, out).toBe(1);
			expect(out).toContain("retrying launch in 10s (attempt 2 of 2)");
			expect(out).not.toContain("launch attempt 2 failed");
			expect(out).toMatch(/^FAIL: /m);

			// Every failure-path dump is byte-counted, and the full log is
			// shown (the stand-in's line), both on WARN and final FAIL.
			expect(out).toMatch(/app log \(\d+ bytes\) follows:/);
			expect(out.match(/app log \(\d+ bytes\) follows:/g)?.length).toBe(2);
			expect(out).toContain("stand-in: startup failed (simulated race)");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	{ timeout: 150_000 },
);

it(
	"wrapper-fork race (NEVR-378): a transient xvfb-run staging pid is never taken for the app",
	() => {
		const dir = standIns();
		xvfbRunShim(dir);
		try {
			// The shim's staging subshell carries the wrapper argv (so pgrep
			// matches it like the real Xvfb-staging fork) and outlives the
			// launch asserts before dying — the 10-28/10-29 CI red shape.
			const { code, out } = runSmoke(dir, "good-app", {
				...process.env,
				PATH: `${dir}:${process.env.PATH ?? ""}`,
			});

			// The staging pid must be invisible to the whole run: still a
			// clean PASS with no retry artifacts.
			expect(code, out).toBe(0);
			expect(out).toMatch(
				/^PASS: window-created \+ health-probe logged; app pid \d+ exited cleanly on SIGTERM; no orphaned app process$/m,
			);
			expect(out).not.toContain("WARN");
			expect(out).not.toContain("attempt 2");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	{ timeout: 90_000 },
);

it(
	"gap death after health-probe (NEVR-378): FAIL with reason and byte-counted dump, not a bare crash",
	() => {
		const dir = standIns();
		try {
			const { code, out } = runSmoke(dir, "gap-death-app");

			// The app died before the SIGTERM step: a failing launch, but it
			// must FAIL loudly — never the bare `kill: No such process`
			// set -e crash the 10-29 red showed (run 40834488557).
			expect(code, out).toBe(1);
			expect(out).toMatch(
				/^FAIL: app pid \d+ died before SIGTERM \(after health-probe\)$/m,
			);
			expect(out).toMatch(/app log \(\d+ bytes\) follows:/);
			expect(out).toContain("event=window-created");
			expect(out).toContain("event=health-probe");

			// The death is past launch_attempt, so no retry may fire.
			expect(out).not.toContain("WARN");
			expect(out).not.toContain("attempt 2");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	{ timeout: 90_000 },
);
