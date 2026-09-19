/**
 * STL-16 §5/§7 (T28–T34): Playwright config for the work e2e suite.
 *
 * globalSetup builds the UI once and owns the whole stack (disposable PG →
 * real work/foundation API handlers → seed → vite preview serving the
 * production bundle with /api and /orgs proxied same-origin to the real API).
 * work.spec.ts mocks ONLY auth/config chrome — work requests are never
 * intercepted (§6).
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./apps/stellarc-ui/e2e",
	testMatch: "work.spec.ts",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "line",
	globalSetup: "./apps/stellarc-ui/e2e/tools/work-e2e-env.ts",
	outputDir: "./test-results-work",
	snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
	expect: {
		toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" },
	},
	use: {
		baseURL: "http://127.0.0.1:4183",
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
});
