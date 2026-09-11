import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./apps/stellarc-ui/e2e",
	testMatch: "*.spec.ts",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "line",
	snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
	expect: {
		toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" },
	},
	use: {
		baseURL: "http://127.0.0.1:4173",
		browserName: "chromium",
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "light",
	},
	projects: [
		{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
		{
			name: "tablet",
			use: { viewport: { width: 1024, height: 768 }, hasTouch: true },
		},
		{
			name: "mobile",
			use: {
				viewport: { width: 390, height: 844 },
				hasTouch: true,
				isMobile: true,
			},
		},
		{
			name: "mobile-small",
			use: {
				viewport: { width: 360, height: 640 },
				hasTouch: true,
				isMobile: true,
			},
		},
	],
	webServer: {
		command:
			"bun run --cwd apps/stellarc-ui preview --host 127.0.0.1 --port 4173 --strictPort",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: false,
	},
});
