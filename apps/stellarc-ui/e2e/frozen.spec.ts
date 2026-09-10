import { expect, test } from "@playwright/test";
import { stubOrgShell, stubSignIn } from "./fixtures";

test("sign-in renders the frozen form", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpected = await stubSignIn(page);
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("sign-in.png");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("org-shell renders populated frozen navigation", async ({
  page,
}, info) => {
  const unexpected = await stubOrgShell(page);
  await page.goto("/dashboard/organization/foundation");
  await expect(
    page.getByRole("cell", { name: "Foundation Board", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Progress", exact: true }),
  ).toBeVisible();
  if (info.project.name.startsWith("mobile")) {
    await page.getByTestId("mobile-sidebar-toggle").tap();
  }
  await expect(page.getByTestId("sidebar-organization-identity")).toContainText(
    "Foundation Lab",
  );
  await expect(page.getByTestId("my-tasks-count-badge")).toHaveText("3");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("org-shell.png");
  expect(unexpected).toEqual([]);
});
