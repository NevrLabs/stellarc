import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		include: ["tests/integration/**/*.test.ts"],
		pool: "forks",
		maxWorkers: 1,
		// Disposable-PG tests initdb a cluster per suite (initdb+migrate can take
		// 20-40s under CI load); review-4 defect 10: 30s flaked under full-suite load.
		testTimeout: 120000,
		hookTimeout: 120000,
	},
});
