import { expect, test } from "@playwright/test";
import { stubOrgShell, stubSignIn } from "./fixtures";

// Screens mandated by §6 whose fixture surface is not yet served end to end
// (owning slices must ship the missing stub endpoints and promote these to
// captured baselines). §5e.3: never skip silently.
const pendingScreens: Array<[string, string, string, string]> = [
  [
    "/dashboard/organization/foundation/my-tasks",
    "my-tickets",
    "My Tickets",
    "STL-16",
  ],
  ["/dashboard/organization/foundation/inbox", "inbox", "Inbox", "STL-17"],
  [
    "/dashboard/organization/foundation/board/foundation-board/board",
    "kanban",
    "Foundation Board",
    "STL-16",
  ],
  [
    "/dashboard/organization/foundation/board/foundation-board/board?view=list",
    "list",
    "Foundation Board",
    "STL-16",
  ],
  [
    "/dashboard/organization/foundation/board/foundation-board/backlog",
    "backlog",
    "Backlog",
    "STL-16",
  ],
  [
    "/dashboard/organization/foundation/board/foundation-board/calendar",
    "calendar",
    "Calendar",
    "STL-16",
  ],
  [
    "/dashboard/organization/foundation/board/foundation-board/gantt",
    "gantt",
    "Gantt",
    "STL-16",
  ],
  [
    "/dashboard/organization/foundation/board/foundation-board/milestones",
    "milestones",
    "Milestones",
    "STL-19",
  ],
  [
    "/dashboard/organization/foundation/board/foundation-board/board?taskId=fixture-ticket-0",
    "ticket-detail",
    "First probe",
    "STL-16",
  ],
  [
    "/dashboard/organization/foundation/settings/organization/members",
    "members",
    "Members",
    "STL-15",
  ],
  [
    "/dashboard/organization/foundation/settings/organization/teams",
    "teams",
    "Teams",
    "STL-15",
  ],
  [
    "/dashboard/organization/foundation/settings/organization/roles",
    "roles",
    "Roles",
    "STL-15",
  ],
  [
    "/dashboard/organization/foundation/repo",
    "repo-list",
    "Repositories",
    "STL-18",
  ],
  [
    "/dashboard/organization/foundation/repo/fixture-repo/pulls",
    "repo-pulls",
    "Pull requests",
    "STL-18",
  ],
  ["/dashboard/settings/account/developer", "developer", "API Keys", "STL-15"],
];

for (const [path, screen, title, owner] of pendingScreens) {
  test(`evidence screen ${screen} renders its fixture surface (deferred to ${owner})`, async ({
    page,
  }) => {
    test.fixme(
      true,
      `${screen} baseline pending ${owner} fixture endpoints (§6 mandatory screen)`,
    );
    const unexpected = await stubOrgShell(page);
    await page.goto(path);
    await expect(page).toHaveTitle(new RegExp(title));
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${screen}.png`);
    expect(unexpected).toEqual([]);
  });
}

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
  await page.goto(
    "/dashboard/organization/foundation/repo/fixture-repo/issues",
  );
  await expect(
    page.getByText("Gateway timeouts on /v1/shape").first(),
  ).toBeVisible();
  await expect(page.getByText("ada-fixture").first()).toBeVisible();
  // Mobile truncates the repo title link (overflow-hidden); assert the
  // repository sub-nav exists instead.
  await expect(page.getByRole("tab", { name: /open/i }).first()).toBeVisible();
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
    "/dashboard/organization/foundation/repo/fixture-repo/pulls/9",
  );
  await expect(
    page.getByRole("article").getByText("lin-fixture").first(),
  ).toBeVisible();
  if (info.project.name.startsWith("mobile")) {
    await page.getByRole("tab", { name: /commits/i }).tap();
  } else {
    await page.getByRole("tab", { name: /commits/i }).click();
  }
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
  // Mobile collapses the table into cards; the New-project action proves the
  // populated projects view rendered on every viewport.
  await expect(
    page.getByRole("button", { name: "New project" }).first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("projects.png");
  await page.goto("/dashboard/organization/foundation/projects/foundation-lab");
  await expect(page.getByTestId("project-overview")).toBeVisible();
  await expect(page.getByText("Stock adapter round-trips")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("project-detail.png");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
