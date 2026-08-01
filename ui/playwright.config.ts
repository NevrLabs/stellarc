import { defineConfig } from "@playwright/test";

const baseURL = process.env.STELLARC_DEV_BASE_URL ?? "http://127.0.0.1:5177";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared dev backend, single session state
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
