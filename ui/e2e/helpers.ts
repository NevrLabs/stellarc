import { type Page } from "@playwright/test";
import { readFileSync } from "fs";

const baseURL = process.env.STELLARC_DEV_BASE_URL ?? "http://127.0.0.1:5177";
export { baseURL };

export async function resolvePassword(): Promise<string> {
  const env = process.env.STELLARC_DEV_PASSWORD;
  if (env) return env;
  const home = process.env.HOME ?? "/home/rpw";
  return readFileSync(`${home}/.stellarc-dev/dev-admin-password`, "utf8").trim();
}

const SHOT_DIR = "e2e/screenshots";
let shotCounter = 0;
export async function shot(page: Page, name: string) {
  const num = String(++shotCounter).padStart(2, "0");
  await page.screenshot({ path: `${SHOT_DIR}/${num}-${name}.png`, fullPage: false });
}

export async function authOnce() {
  const pw = await resolvePassword();
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage();
  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await page.evaluate(async ({ password }) => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "dev-admin", password }),
    });
  }, { password: pw });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".app").waitFor({ state: "visible", timeout: 15_000 });
  const state = await page.context().storageState();
  await browser.close();
  return state;
}

export async function openSession(page: Page, sessionId: string) {
  await page.goto(`${baseURL}/sessions/${sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
}
