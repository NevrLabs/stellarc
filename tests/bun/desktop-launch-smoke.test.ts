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
 * NEVR-470 — launch-smoke.sh owns the Xvfb lifecycle itself (Xvfb
 * -displayfd, no xvfb-run -a auto display probe) and every failure reason
 * carries a mode name (xvfb-startup / app-death … / line never appeared).
 * The sabotage test fails against the pre-NEVR-470 script: an X-side death
 * there surfaces as an unnamed 30s "app process never appeared under xvfb"
 * slog (or not at all — xvfb-run shields the stub), never as the named
 * xvfb-startup mode.
 */

const repoRoot = join(import.meta.dir, "..", "..");
const script = join(repoRoot, "desktop", "scripts", "launch-smoke.sh");

const hasDeps =
	spawnSync("bash", ["-c", "command -v Xvfb pgrep >/dev/null"]).status === 0;

function runSmoke(dir: string, app: string, env?: Record<string, string>) {
	const res = spawnSync("bash", [script, `./${app}`], {
		cwd: dir,
		encoding: "utf8",
		timeout: 150_000,
		env: env ? { ...process.env, ...env } : process.env,
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
	for (const app of ["good-app", "race-death-app"]) {
		chmodSync(join(dir, app), 0o755);
	}
	return dir;
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
	"xvfb-startup sabotage: both attempts FAIL with the named xvfb-startup mode",
	() => {
		const dir = standIns();
		// Sabotage dir shadows `Xvfb` on PATH with a stand-in that dies
		// instantly — the xvfb-run -a auto-probe race shape: the wrapper /
		// X-server chain dead before the client ever runs. The good-app
		// stand-in itself cannot fail, so any red here is X-side by
		// construction.
		const sabotage = mkdtempSync(join(tmpdir(), "launch-smoke-sabotage-"));
		writeFileSync(
			join(sabotage, "Xvfb"),
			[
				"#!/usr/bin/env bash",
				'echo "sabotaged Xvfb: refusing to start" >&2',
				"exit 1",
				"",
			].join("\n"),
		);
		chmodSync(join(sabotage, "Xvfb"), 0o755);
		try {
			const { code, out } = runSmoke(dir, "good-app", {
				PATH: `${sabotage}:${process.env.PATH}`,
			});
			expect(code, out).toBe(1);

			// The failure mode is named on both the WARN and the final FAIL —
			// classifiable from the job log alone, no re-pulling needed.
			expect(out).toContain("WARN: launch attempt 1 failed (xvfb-startup:");
			expect(out).toMatch(/^FAIL: xvfb-startup: /m);
			expect(out).toContain("retrying launch in 10s (attempt 2 of 2)");

			// Both failure-path dumps stay byte-counted; the X server's own
			// stderr (with the sabotage line) is shown next to the app log
			// (0 bytes — the client never ran).
			expect(out.match(/app log \(\d+ bytes\) follows:/g)?.length).toBe(2);
			expect(out.match(/xvfb stderr \(\d+ bytes\) follows:/g)?.length).toBe(2);
			expect(out).toContain("sabotaged Xvfb: refusing to start");
			expect(out).not.toContain("died before creating a window");
		} finally {
			rmSync(dir, { recursive: true, force: true });
			rmSync(sabotage, { recursive: true, force: true });
		}
	},
	{ timeout: 90_000 },
);
