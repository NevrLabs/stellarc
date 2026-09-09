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
		const timer = setTimeout(() => child.kill(), 300000);
		try {
			expect(await child.exited).toBe(0);
		} finally {
			clearTimeout(timer);
		}
	}, 310000);
}
