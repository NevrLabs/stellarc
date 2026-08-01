import { expect, type Page } from "@playwright/test";

/**
 * E2E helpers for Stellarc sessions UI tests.
 *
 * Auth: cookie-based. POST /api/auth/login sets the session cookie; we do this
 * via page.evaluate(fetch) so we stay on the same origin (same pattern as the
 * existing dev.spec.ts).
 */

const baseURL = process.env.STELLARC_DEV_BASE_URL ?? "http://127.0.0.1:5177";
const username = process.env.STELLARC_DEV_USERNAME ?? "dev-admin";
const password = process.env.STELLARC_DEV_PASSWORD ?? "";

export { baseURL };

/** Resolve the dev-admin password from the conventional file. */
export async function resolvePassword(): Promise<string> {
  if (password) return password;
  const { readFileSync } = await import("node:fs");
  const path = (await import("node:path")).default || (await import("node:path"));
  const home = process.env.HOME ?? "/home/rpw";
  try {
    return readFileSync(
      `${home}/.stellarc-dev/dev-admin-password`, "utf8",
    ).trim();
  } catch {
    throw new Error(
      "Could not resolve dev-admin password. Set STELLARC_DEV_PASSWORD or create ~/.stellarc-dev/dev-admin-password",
    );
  }
}

/** Authenticate the page via REST, then reload so the app mounts in authed state. */
export async function signIn(page: Page): Promise<void> {
  const pw = await resolvePassword();
  await page.goto(baseURL);
  await page.evaluate(() => localStorage.clear());
  const status = await page.evaluate(
    async ({ username, password }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      return r.status;
    },
    { username, password: pw },
  );
  expect(status).toBe(200);
  await page.reload();
  await expect(page.locator(".app")).toBeVisible({ timeout: 15_000 });
}

/** Create a session via REST (fast, no UI interaction). Returns session id. */
export async function createSessionViaAPI(
  page: Page,
  opts?: { agent?: string; node?: string },
): Promise<string> {
  const res = await page.evaluate(async (opts) => {
    const r = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    });
    if (!r.ok) throw new Error(`create session: ${r.status}`);
    return r.json() as Promise<{ id: string }>;
  }, opts ?? {});
  return res.id;
}

/** Send a message via REST. Returns void (response streams over WS). */
export async function sendMessageViaAPI(
  page: Page,
  sessionId: string,
  text: string,
): Promise<void> {
  const status = await page.evaluate(
    async ({ sessionId, text }) => {
      const r = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      return r.status;
    },
    { sessionId, text },
  );
  if (status >= 400) throw new Error(`sendMessage: ${status}`);
}

/** Navigate to a session by URL and wait for chat view. */
export async function openSession(page: Page, sessionId: string): Promise<void> {
  await page.goto(`${baseURL}/sessions/${sessionId}`);
  await expect(page.locator(".chat-view")).toBeVisible({ timeout: 10_000 });
}

/** Wait for the sidebar session list to render. */
export async function waitForSidebar(page: Page): Promise<void> {
  await expect(page.locator(".srow[data-session-id]").first()).toBeVisible({
    timeout: 10_000,
  });
}

// ── Selectors ──────────────────────────────────────────────────────

export const sel = {
  // Auth
  loginForm: ".auth-form",
  usernameInput: ".auth-form input[autocomplete='username']",
  passwordInput: ".auth-form input[type='password']",
  signInButton: ".auth-submit",

  // Sidebar
  newSessionButton: "button:has-text('New session')",
  sessionRow: ".srow[data-session-id]",
  sessionRowById: (id: string) => `.srow[data-session-id="${id}"]`,
  focusedRow: ".srow[data-focused='true']",

  // Chat
  chatView: ".chat-view",
  transcript: ".transcript",
  composerInput: ".composer-input",
  sendButton: ".composer .send:not(.stop):not(.queue-add)",
  stopButton: ".composer .send.stop",

  // Composer controls
  modelPill: ".comp-l .modelpill",
  thinkingPill: ".comp-r .modelpill",
  modelMenu: ".comp-l .selpop",
  thinkingMenu: ".comp-r .selpop",

  // Status
  statusDot: ".vp-head [class*='rounded-full']",
  liveBadge: ".chat-live-badge",

  // Auto-scroll
  scrollBottomBtn: ".scroll-bottom-btn",

  // Messages
  messageRow: ".msg-row",
  userMessage: ".msg-row-user",
  aiMessage: ".msg-row-ai",
  msgAi: ".msg-ai",
  thinkingDots: ".thinking-dots",
  msgEmpty: ".msg-empty",

  // Error
  errorAlert: "[role='alert']",
};
