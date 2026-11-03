import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: "*.spec.ts",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "line",
	outputDir: "./e2e/.artifacts",
	use: {
		baseURL: "http://localhost:5180",
		browserName: "chromium",
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
		// System chromium: the sandbox has no Playwright browser downloads.
		launchOptions: {
			executablePath: "/usr/bin/chromium",
		},
	},
	projects: [
		{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
	],
	webServer: {
		// Tests run against the built static shell (vite preview), proving the
		// ADR 0014 §4 requirement: `bun run build` output serves as-is.
		command: "bun run build && bunx vite preview --port 5180 --strictPort",
		url: "http://localhost:5180",
		reuseExistingServer: true,
		timeout: 240000,
	},
});
