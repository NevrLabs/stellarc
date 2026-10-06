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
		// The real-PG integration suite runs ~400s on a loaded host; 300s killed it.
		const timer = setTimeout(() => child.kill(), 900000);
		try {
			expect(await child.exited).toBe(0);
		} finally {
			clearTimeout(timer);
		}
	}, 910000);
}
