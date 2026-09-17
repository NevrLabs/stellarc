import { expect, test } from "bun:test";

for (const config of ["vitest.config.ts", "vitest.integration.config.ts"]) {
	test(`Vitest gate: ${config}`, async () => {
		const child = Bun.spawn(
			[
				process.execPath,
				"--bun",
				"node_modules/vitest/vitest.mjs",
				"run",
				"--config",
				config,
			],
			{ stdout: "inherit", stderr: "inherit" },
		);
		// STL-15: the integration suite grew past 300s (identity suites add
		// ~130s); kill at 15 min so slow CI machines still fail loudly. The
		// eight-file suite measured 598s on an idle host, leaving the previous
		// 10-minute cap seconds of headroom — the gate flaked on contention.
		const timer = setTimeout(() => child.kill(), 900000);
		try {
			expect(await child.exited).toBe(0);
		} finally {
			clearTimeout(timer);
		}
	}, 910000);
}
