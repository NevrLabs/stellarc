import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		include: ["tests/integration/**/*.test.ts"],
		pool: "forks",
		maxWorkers: 1,
		// Disposable-PG fixtures (initdb+start) can exceed 30s on a loaded
		// shared host; integration assertions themselves run in seconds.
		testTimeout: 120000,
		hookTimeout: 120000,
	},
});
