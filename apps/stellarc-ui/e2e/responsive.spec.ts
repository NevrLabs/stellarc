import { expect, test } from "@playwright/test";
import { stubOrgShell } from "./fixtures";

test("org-shell preserves touch Sheet and strict mobile breakpoint", async ({
  page,
}, info) => {
  const unexpected = await stubOrgShell(page);
  await page.goto("/dashboard/organization/foundation");
  await expect(
    page.getByRole("cell", { name: "Foundation Board", exact: true }),
  ).toBeVisible();
  const rail = page.locator('[data-slot="sidebar-container"]');
  if (info.project.name.startsWith("mobile")) {
    const original = page.viewportSize()!;
    const sheet = page.locator('[data-slot="sidebar"][data-mobile="true"]');
    const toggle = page.getByTestId("mobile-sidebar-toggle");
    await expect(rail).toHaveCount(0);
    await expect(sheet).not.toBeVisible();
    await toggle.tap();
    await expect(sheet).toBeVisible();
    await page.touchscreen.tap(original.width - 8, original.height / 2);
    await expect(sheet).not.toBeVisible();
    await expect(rail).toHaveCount(0);
    await page.setViewportSize({ width: 767, height: original.height });
    await expect(rail).toHaveCount(0);
    await toggle.tap();
    await expect(sheet).toBeVisible();
    await page.touchscreen.tap(759, original.height / 2);
    await expect(sheet).not.toBeVisible();
    await page.setViewportSize({ width: 768, height: original.height });
    await expect(rail).toBeVisible();
    await expect(toggle).not.toBeVisible();
    await page.setViewportSize(original);
    await expect(rail).toHaveCount(0);
  } else {
    await expect(rail).toBeVisible();
    const link = rail.getByRole("button", { name: "Inbox", exact: true });
    const next = rail.getByRole("button", { name: /My Tickets/ });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(next).toBeFocused();
  }
  expect(unexpected).toEqual([]);
});
