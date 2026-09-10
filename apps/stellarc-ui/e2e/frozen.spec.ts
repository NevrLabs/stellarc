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

test("repo issues and pull request entities render from the fixture", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpected = await stubOrgShell(page);
  await page.goto("/dashboard/organization/foundation/repo/fixture-repo/issues");
  await expect(
    page.getByText("Gateway timeouts on /v1/shape").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Preserve bigint cursors across reconnects").first(),
  ).toBeVisible();
  await expect(
    page.getByText("foundation/probe", { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("repo-issues.png");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("repo pull request detail renders checks, commits and files", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpected = await stubOrgShell(page);
  await page.goto(
    "/dashboard/organization/foundation/repo/fixture-repo/pulls/1",
  );
  await expect(
    page.getByRole("heading", { name: "Preserve bigint cursors across reconnects" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /commits/i }).tap();
  await expect(page.getByText("c1ffee")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("repo-pull-detail.png");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("projects list and project detail render from the fixture", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpected = await stubOrgShell(page);
  await page.goto("/dashboard/organization/foundation/projects");
  await expect(
    page.getByRole("link", { name: /Sync Foundation/ }).first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("projects.png");
  await page.goto(
    "/dashboard/organization/foundation/projects/foundation-lab",
  );
  await expect(page.getByTestId("project-overview")).toBeVisible();
  await expect(page.getByText("Ship the sync foundation")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("project-detail.png");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
