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
		// ~130s); kill at 10 min so slow CI machines still fail loudly.
		const timer = setTimeout(() => child.kill(), 600000);
		try {
			expect(await child.exited).toBe(0);
		} finally {
			clearTimeout(timer);
		}
	}, 610000);
}
