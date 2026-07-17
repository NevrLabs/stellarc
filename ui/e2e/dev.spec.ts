import { expect, test, type Locator, type Page } from "@playwright/test";

const baseURL = process.env.OLYMPUS_DEV_BASE_URL ?? "http://127.0.0.1:5177";
const username = process.env.OLYMPUS_DEV_USERNAME;
const password = process.env.OLYMPUS_DEV_PASSWORD;

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("resize handle is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test("live dev interactions", async ({ page }) => {
  if (!username || !password) throw new Error("dev credentials were not supplied");

  await page.goto(baseURL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".app")).toBeVisible();

  const rows = page.locator(".srow[data-session-id]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  await rows.nth(0).click();
  await expect(page.locator(".chat-view")).toHaveCount(1);
  await rows.nth(1).click();
  await expect(page.locator(".chat-view")).toHaveCount(1);
  await expect(page.locator(".sessions-dockview")).toHaveCount(0);
  await expect(page.locator(".srow[data-focused=true]")).toHaveCount(1);

  const bottom = page.locator(".chat-view .bpanel");
  const bottomHandle = page.locator(".chat-view .rz-y");
  const h1 = (await bottom.boundingBox())!.height;
  await drag(page, bottomHandle, 0, -25);
  const h2 = (await bottom.boundingBox())!.height;
  await drag(page, bottomHandle, 0, -25);
  const h3 = (await bottom.boundingBox())!.height;
  expect(h2).toBeGreaterThan(h1 + 15);
  expect(h3).toBeGreaterThan(h2 + 15);

  const right = page.locator(".chat-view .rsidebar");
  const rightHandle = page.locator(".chat-view .vp-body > .rz-x");
  const w1 = (await right.boundingBox())!.width;
  await drag(page, rightHandle, -30, 0);
  const w2 = (await right.boundingBox())!.width;
  expect(w2).toBeGreaterThan(w1 + 20);

  const usage = page.getByRole("button", { name: "Usage", exact: true });
  await usage.click();
  await expect(usage).toHaveClass(/\bon\b/);
  expect(await usage.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");

  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "obsidian");
});

test("project workspace layout restores and session route stays single-pane", async ({ page }) => {
  if (!username || !password) throw new Error("dev credentials were not supplied");

  await page.goto(baseURL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".app")).toBeVisible();

  const workspace = page.locator("[data-project-id]").first();
  await expect(workspace).toBeVisible();
  await workspace.click();
  await expect(page).toHaveURL(/\/sessions\/projects\//);

  const rows = page.locator(".srow[data-session-id]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  const singleSessionId = await rows.nth(0).getAttribute("data-session-id");
  expect(singleSessionId).toBeTruthy();

  await rows.nth(0).click();
  await expect(page.locator(".chat-view")).toBeVisible();
  await rows.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open Right" }).click();
  await expect(page.locator(".sessions-dockview.multi-group")).toBeVisible();
  const groupTabBars = page.locator(
    ".sessions-dockview.multi-group .dv-tabs-and-actions-container",
  );
  await expect(groupTabBars).toHaveCount(2);
  await expect(groupTabBars.first()).toBeVisible();
  await expect(groupTabBars.nth(1)).toBeVisible();

  const before = await page.locator(".dv-groupview").evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  expect(before.length).toBeGreaterThanOrEqual(2);
  expect(before.every((box) => box.width > 100 && box.height > 100)).toBe(true);

  await page.reload();
  await expect(page.locator(".sessions-dockview.multi-group")).toBeVisible();
  await expect(page.locator(".chat-view")).toHaveCount(before.length);
  const restored = await page.locator(".dv-groupview").evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  expect(restored.every((box) => box.width > 100 && box.height > 100)).toBe(true);

  await page.goto(`${baseURL}/sessions/${encodeURIComponent(singleSessionId!)}`);
  await expect(page.locator(".sessions-dockview")).toHaveCount(0);
  await expect(page.locator(".chat-view")).toHaveCount(1);
});
