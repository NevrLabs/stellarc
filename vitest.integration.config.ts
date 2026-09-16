import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		include: ["tests/integration/**/*.test.ts"],
		pool: "forks",
		maxWorkers: 1,
		testTimeout: 120000,
		hookTimeout: 120000,
	},
});
