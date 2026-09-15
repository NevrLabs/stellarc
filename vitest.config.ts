import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		include: ["tests/unit/**/*.test.ts"],
		// Identity suites boot disposable PostgreSQL clusters (initdb) and run
		// migrations in beforeEach, far exceeding runner defaults (T23/T34):
		// single forked worker keeps the clusters serialized and quiet.
		pool: "forks",
		maxWorkers: 1,
		testTimeout: 120000,
		hookTimeout: 120000,
	},
});
