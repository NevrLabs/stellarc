import { expect, test } from "@playwright/test";
import { stubSignIn } from "./fixtures";

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
