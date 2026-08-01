import { expect, test } from "@playwright/test";
import { signIn, sel, openSession, createSessionViaAPI, waitForSidebar } from "./helpers";

// ── 1. Login flow ─────────────────────────────────────────────────

test.describe("Login flow", () => {
  test("UI form login succeeds and dashboard loads", async ({ page }) => {
    const { resolvePassword } = await import("./helpers");
    const pw = await resolvePassword();
    await page.goto("/");
    // Login panel visible (not authed yet)
    await expect(page.locator(sel.loginForm)).toBeVisible({ timeout: 10_000 });
    await page.locator(sel.usernameInput).fill("dev-admin");
    await page.locator(sel.passwordInput).fill(pw);
    await page.locator(sel.signInButton).click();
    // App mounts
    await expect(page.locator(".app")).toBeVisible({ timeout: 15_000 });
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(sel.loginForm)).toBeVisible({ timeout: 10_000 });
    await page.locator(sel.usernameInput).fill("dev-admin");
    await page.locator(sel.passwordInput).fill("wrong-password-xyz");
    await page.locator(sel.signInButton).click();
    await expect(page.locator(sel.errorAlert)).toBeVisible({ timeout: 10_000 });
    // App must NOT be visible
    await expect(page.locator(".app")).toHaveCount(0);
  });
});

// ── 2. Session creation ───────────────────────────────────────────

test.describe("Session creation", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await waitForSidebar(page);
  });

  test("clicking New Session navigates to draft page", async ({ page }) => {
    await page.locator(sel.newSessionButton).click();
    // DraftSession renders a composer inside the chat-view
    await expect(page.locator(sel.chatView)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(sel.composerInput)).toBeVisible();
  });

  test("session appears in sidebar after creation via API", async ({ page }) => {
    const id = await createSessionViaAPI(page);
    await page.reload();
    await waitForSidebar(page);
    await expect(page.locator(sel.sessionRowById(id))).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ── 3. Message send ───────────────────────────────────────────────

test.describe("Message send", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    const id = await createSessionViaAPI(page);
    await openSession(page, id);
  });

  test("typing and pressing Enter shows message in transcript", async ({ page }) => {
    const text = `E2E test message ${Date.now()}`;
    await page.locator(sel.composerInput).fill(text);
    await page.locator(sel.composerInput).press("Enter");

    // Optimistic user bubble appears immediately
    await expect(page.locator(sel.userMessage).filter({ hasText: text })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("send button click also sends message", async ({ page }) => {
    const text = `Button send ${Date.now()}`;
    await page.locator(sel.composerInput).fill(text);
    await page.locator(sel.sendButton).click();
    await expect(page.locator(sel.userMessage).filter({ hasText: text })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("empty composer does not send", async ({ page }) => {
    const before = await page.locator(sel.userMessage).count();
    await page.locator(sel.composerInput).press("Enter");
    await page.waitForTimeout(500);
    const after = await page.locator(sel.userMessage).count();
    expect(after).toBe(before);
  });
});

// ── 4. Composer controls ──────────────────────────────────────────

test.describe("Composer controls", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    const id = await createSessionViaAPI(page);
    await openSession(page, id);
  });

  test("model selector dropdown opens", async ({ page }) => {
    await page.locator(sel.modelPill).click();
    // Either the menu shows models or the "no models" fallback
    await expect(page.locator(sel.modelMenu)).toBeVisible({ timeout: 5_000 });
  });

  test("thinking selector dropdown opens and shows levels", async ({ page }) => {
    await page.locator(sel.thinkingPill).click();
    await expect(page.locator(sel.thinkingMenu)).toBeVisible({ timeout: 5_000 });
    // "off" is always present
    await expect(page.locator(sel.thinkingMenu).getByText("Off")).toBeVisible();
    await expect(page.locator(sel.thinkingMenu).getByText("High")).toBeVisible();
  });

  test("context preset appears in thinking menu", async ({ page }) => {
    await page.locator(sel.thinkingPill).click();
    await expect(page.locator(sel.thinkingMenu)).toBeVisible();
    await expect(page.locator(sel.thinkingMenu).getByText("Default")).toBeVisible();
    await expect(page.locator(sel.thinkingMenu).getByText("256K")).toBeVisible();
    await expect(page.locator(sel.thinkingMenu).getByText("1M")).toBeVisible();
  });

  test("selecting thinking level persists label on pill", async ({ page }) => {
    await page.locator(sel.thinkingPill).click();
    await expect(page.locator(sel.thinkingMenu)).toBeVisible();
    // Click "Medium"
    await page.locator(sel.thinkingMenu).getByText("Medium", { exact: true }).click();
    // Pill should now show "Medium"
    await expect(page.locator(sel.thinkingPill)).toContainText("Medium", { timeout: 3_000 });
  });
});

// ── 5. Auto-scroll ────────────────────────────────────────────────

test.describe("Auto-scroll behavior", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    const id = await createSessionViaAPI(page);
    await openSession(page, id);
  });

  test("jump-to-bottom button appears when scrolled up", async ({ page }) => {
    // Need enough messages to make the transcript scrollable.
    // Send several messages to build height.
    for (let i = 0; i < 8; i++) {
      await page.locator(sel.composerInput).fill(`Scroll test line ${i} — padding `.repeat(5));
      await page.locator(sel.composerInput).press("Enter");
      await page.waitForTimeout(150);
    }
    // Scroll up
    await page.locator(sel.transcript).evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.locator(sel.scrollBottomBtn)).toBeVisible({ timeout: 5_000 });
  });

  test("clicking jump-to-bottom scrolls to bottom", async ({ page }) => {
    for (let i = 0; i < 8; i++) {
      await page.locator(sel.composerInput).fill(`Scroll test ${i} — padding `.repeat(5));
      await page.locator(sel.composerInput).press("Enter");
      await page.waitForTimeout(150);
    }
    // Scroll up to show the button
    await page.locator(sel.transcript).evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.locator(sel.scrollBottomBtn)).toBeVisible({ timeout: 5_000 });

    // Click it
    await page.locator(sel.scrollBottomBtn).click();
    // Button should disappear (we're at bottom now)
    await expect(page.locator(sel.scrollBottomBtn)).toHaveCount(0, { timeout: 5_000 });
  });
});

// ── 6. Session switching ──────────────────────────────────────────

test.describe("Session switching", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await waitForSidebar(page);
  });

  test("clicking different sessions switches transcript", async ({ page }) => {
    const id1 = await createSessionViaAPI(page);
    const id2 = await createSessionViaAPI(page);
    await page.reload();
    await waitForSidebar(page);

    // Open session 1
    await page.locator(sel.sessionRowById(id1)).click();
    await expect(page.locator(sel.chatView)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(sel.chatView)).toHaveAttribute(
      "data-session-id", id1, { timeout: 5_000 },
    );

    // Open session 2
    await page.locator(sel.sessionRowById(id2)).click();
    await expect(page.locator(sel.chatView)).toHaveAttribute(
      "data-session-id", id2, { timeout: 5_000 },
    );
  });

  test("focused session row has data-focused=true", async ({ page }) => {
    const id = await createSessionViaAPI(page);
    await page.reload();
    await waitForSidebar(page);
    await page.locator(sel.sessionRowById(id)).click();
    await expect(page.locator(sel.chatView)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(sel.focusedRow)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(sel.sessionRowById(id))).toHaveAttribute(
      "data-focused", "true",
    );
  });
});

// ── 7. Session status ─────────────────────────────────────────────

test.describe("Session status indicator", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    const id = await createSessionViaAPI(page);
    await openSession(page, id);
  });

  test("status dot is visible in vp-head", async ({ page }) => {
    // The SessionStatusPopover renders a small dot inside vp-head
    await expect(page.locator(".vp-head").locator("button[aria-label='Session status']")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("idle session shows idle liveness text", async ({ page }) => {
    // A freshly created session should be idle
    const statusBtn = page.locator(".vp-head button[aria-label='Session status']");
    await expect(statusBtn).toContainText(/idle|…/, { timeout: 5_000 });
  });
});

// ── 8. Error states ───────────────────────────────────────────────

test.describe("Error states", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loading a non-existent session does not crash the app", async ({ page }) => {
    await page.goto("/sessions/nonexistent-session-id-12345");
    // The app should still be mounted — either showing an error or the chat skeleton
    await expect(page.locator(".app")).toBeVisible({ timeout: 10_000 });
  });

  test("workspace error banner on failed session open", async ({ page }) => {
    // Navigate to a session that doesn't exist — the error alert or error state
    // should be surfaced within the app, not a blank screen
    await page.goto("/sessions/nonexistent-session-id-67890");
    await expect(page.locator(".app")).toBeVisible({ timeout: 10_000 });
    // The transcript area or error banner must contain some feedback text
    const transcript = page.locator(sel.transcript);
    const alert = page.locator(sel.errorAlert);
    // At least one of these must be visible within a reasonable time
    await expect(transcript.or(alert)).toBeVisible({ timeout: 10_000 });
  });
});
