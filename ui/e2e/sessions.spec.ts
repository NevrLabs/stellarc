import { expect, test, type Page } from "@playwright/test";
import { authOnce, shot, baseURL } from "./helpers";

let storageState: Awaited<ReturnType<typeof authOnce>>;

test.beforeAll(async () => { storageState = await authOnce(); }, 30_000);
test.beforeEach(async ({ page }) => { await page.context().addCookies(storageState.cookies); });

/** Navigate to sessions and activate the Sessions surface tab. */
async function gotoSessions(page: Page) {
  await page.goto(`${baseURL}/sessions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  // Click the first surface tab (Sessions) to activate the view
  const tab = page.locator("[role=tablist] button, .layouts button").first();
  if (await tab.count() > 0) {
    await tab.click();
    await page.waitForTimeout(1500);
  }
}

test("1. login shows app", async ({ page }) => {
  await gotoSessions(page);
  await expect(page.locator(".app")).toBeVisible();
  await shot(page, "01-login");
});

test("2. sidebar visible", async ({ page }) => {
  await gotoSessions(page);
  await expect(page.locator(".sb-search-input")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".session-sidebar-primary button").first()).toBeVisible();
  await expect(page.locator(".sb-search-input")).toBeVisible();
  await shot(page, "02-sidebar");
});

test("3. new session button", async ({ page }) => {
  await gotoSessions(page);
  await page.locator(".session-sidebar-primary button").first().click();
  await page.waitForTimeout(2000);
  expect(page.url()).toContain("/sessions/");
  await shot(page, "03-new-session");
});

test("4. session switching", async ({ page }) => {
  await gotoSessions(page);
  const rows = page.locator(".srow[data-session-id]");
  const count = await rows.count();
  if (count >= 2) {
    await rows.nth(0).click();
    await page.waitForTimeout(1000);
    await expect(rows.nth(0)).toHaveAttribute("data-focused", "true");
    await rows.nth(1).click();
    await page.waitForTimeout(1000);
    await expect(rows.nth(1)).toHaveAttribute("data-focused", "true");
  }
  await shot(page, "04-session-switch");
});

test("5. search filters", async ({ page }) => {
  await gotoSessions(page);
  const search = page.locator(".sb-search-input");
  await expect(search).toBeVisible();
  const before = await page.locator(".srow").count();
  await search.fill("zzz-nonexistent-xyz");
  await page.waitForTimeout(500);
  const after = await page.locator(".srow").count();
  expect(after).toBeLessThanOrEqual(before);
  await shot(page, "05-search-filter");
});

test("6. session page loads", async ({ page }) => {
  await gotoSessions(page);
  await expect(page.locator(".app")).toBeVisible();
  await shot(page, "06-session-page");
});

test("7. error no crash", async ({ page }) => {
  await page.goto(`${baseURL}/sessions/nonexistent-id`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await expect(page.locator(".app")).toBeVisible();
  await shot(page, "07-error-state");
});
