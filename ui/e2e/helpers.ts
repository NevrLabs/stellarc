import { expect, type Page } from "@playwright/test";

const baseURL = process.env.STELLARC_DEV_BASE_URL ?? "http://127.0.0.1:5177";
export { baseURL };

export async function resolvePassword(): Promise<string> {
  const env = process.env.STELLARC_DEV_PASSWORD;
  if (env) return env;
  const { readFileSync } = await import("node:fs");
  const home = process.env.HOME ?? "/home/rpw";
  return readFileSync(`${home}/.stellarc-dev/dev-admin-password`, "utf8").trim();
}

/** Sign in via the UI form (works with real auth, not MSW). */
export async function signIn(page: Page) {
  const pw = await resolvePassword();
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Check if already authenticated (MSW or cookie)
  const appVisible = await page.locator(".app").count();
  if (appVisible > 0) return;

  // Real auth form
  const form = page.locator(".auth-form");
  await form.waitFor({ state: "visible", timeout: 10_000 });
  await form.locator('input[autocomplete="username"]').fill("dev-admin");
  await form.locator('input[type="password"]').fill(pw);
  await form.locator('button[type="submit"]').click();
  await page.locator(".app").waitFor({ state: "visible", timeout: 15_000 });
}

/** Sign in via API (sets cookie, no UI interaction). */
export async function signInViaAPI(page: Page) {
  const pw = await resolvePassword();
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ username, password }) => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  }, { username: "dev-admin", password: pw });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".app").waitFor({ state: "visible", timeout: 15_000 });
}

export const sel = {
  app: ".app",
  authForm: ".auth-form",
  usernameInput: 'input[autocomplete="username"]',
  passwordInput: 'input[type="password"]',
  signInButton: 'button[type="submit"]',
  errorAlert: ".auth-error",
  newSessionButton: '.session-sidebar-primary button',
  sidebar: '.sidebar',
  sessionRow: '.srow',
  activeSessionRow: '.srow.focused',
  transcript: '.transcript, .tcol',
  composer: '.composer textarea, .cmp textarea',
  composerSend: '.cmp-btn-send, .composer button:last-child',
  scrollBottomBtn: '.scroll-bottom-btn',
  statusDot: '.srow-icon',
};

export async function openSession(page: Page, sessionId: string) {
  await page.goto(`${baseURL}/sessions/${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}

export async function createSessionViaAPI(page: Page): Promise<string> {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return data.id as string;
  });
  return result;
}

export async function waitForSidebar(page: Page) {
  await page.locator(sel.sidebar).waitFor({ state: "visible", timeout: 10_000 });
}
