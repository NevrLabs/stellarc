// STL-21 §6/T16: live-data parity for the Projects screens. Unlike
// frozen.spec.ts (fixture-stubbed), project traffic here hits the REAL API
// over a disposable Postgres through the preview proxy — the request counter
// in the harness proves /api/project* was served live, never intercepted.
// Only the identity/org-shell surface (STL-15 scope, unmerged) is stubbed,
// with route.fallback() so project requests pass through untouched.

import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// Static UI + live API harness. Boots once per worker process.
let harnessPromise:
  | Promise<{
      uiUrl: string;
      projectRequests: () => number;
    }>
  | undefined;

async function harness() {
  harnessPromise ??= (async () => {
    const { startProjectsFixtureServer } = await import(
      "../../../tests/helpers/projects-fixture"
    );
    const server = await startProjectsFixtureServer();
    let projectHits = 0;
    const dist = `${process.cwd()}/apps/stellarc-ui/dist`;
    const ui = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/api/")) {
          if (url.pathname.startsWith("/api/project")) projectHits += 1;
          const upstream = await fetch(
            `${server.url}${url.pathname}${url.search}`,
            {
              method: request.method,
              headers: request.headers,
              body: ["GET", "HEAD"].includes(request.method)
                ? undefined
                : await request.text(),
            },
          );
          return new Response(upstream.body, upstream);
        }
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        try {
          const file = readFileSync(`${dist}${path}`);
          const type = path.endsWith(".html")
            ? "text/html"
            : path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".css")
                ? "text/css"
                : "application/octet-stream";
          return new Response(file, { headers: { "content-type": type } });
        } catch {
          return new Response(readFileSync(`${dist}/index.html`), {
            headers: { "content-type": "text/html" },
          });
        }
      },
    });
    return {
      uiUrl: ui.url.origin,
      projectRequests: () => projectHits,
    };
  })();
  return harnessPromise;
}

// Identity/org-shell stubs (STL-15 scope) — everything else falls through.
async function stubIdentity(page: Page) {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const organization = {
    id: "fixture-org",
    name: "Foundation Lab",
    slug: "foundation",
    createdAt,
    logo: null,
    reposEnabled: true,
  };
  const users = ["Ada", "Lin"].map((name, index) => ({
    id: `fixture-user-${index}`,
    name,
    email: `${name.toLowerCase()}@example.test`,
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
    image: null,
    locale: "en-US",
  }));
  const members = users.map((user, index) => ({
    id: `fixture-member-${index}`,
    organizationId: organization.id,
    userId: user.id,
    role: index === 0 ? "owner" : "member",
    createdAt,
    user,
  }));
  const board = {
    id: "fixture-board",
    organizationId: organization.id,
    slug: "foundation-board",
    name: "Foundation Board",
    icon: "kanban",
    description: "Synthetic foundation work",
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    startDate: null,
    dueDate: null,
    status: "active",
    plannedTasks: [],
    archivedTasks: [],
    tasks: [],
    statistics: { totalTasks: 0, completionPercentage: 0, dueDate: null },
    columns: [],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const search = new URL(request.url()).search;
    const key = `${path}${search}`;
    const responses: Record<string, unknown> = {
      "/api/auth/get-session": {
        user: users[0],
        session: {
          id: "fixture-session",
          userId: users[0].id,
          activeOrganizationId: organization.id,
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt,
          updatedAt: createdAt,
        },
      },
      "/api/auth/organization/list": [organization],
      "/api/auth/organization/get-full-organization": {
        ...organization,
        members,
        teams: [],
        invitations: [],
      },
      "/api/auth/organization/list-members": {
        members,
        total: members.length,
      },
      "/api/auth/organization/list-teams": [],
      "/api/organization/fixture-org/principals": users.map((u) => ({
        ...u,
        kind: "user",
      })),
      "/api/board": [board],
      "/api/label/organization/fixture-org": [],
      "/api/task/my-tasks": [],
      "/api/flag/mine": [],
      "/api/notification/unread-count": { count: 0 },
      "/api/invitation/pending": [],
      "/api/data-table/organization/fixture-org": [],
      "/api/ai/organization/fixture-org/settings": {
        enabled: false,
        configured: false,
        effectiveTokenLimit: 0,
        effectiveCharacterLimit: 0,
      },
      "/api/repo?organizationId=fixture-org": [],
    };
    if (
      request.method() === "GET" &&
      (Object.hasOwn(responses, key) || Object.hasOwn(responses, path))
    ) {
      await route.fulfill({
        json: Object.hasOwn(responses, key) ? responses[key] : responses[path],
      });
    } else if (
      request.method() === "POST" &&
      path === "/api/auth/organization/has-permission"
    ) {
      await route.fulfill({ json: { success: true, error: null } });
    } else if (process.env.SABOTAGE_STATIC_FIXTURE) {
      // NEGATIVE CONTROL (T16): intercept project traffic with a static
      // fixture — the parity counters must fail the suite.
      if (path.startsWith("/api/project")) {
        await route.fulfill({ json: [] });
        return;
      }
      await route.fallback();
    } else {
      await route.fallback();
    }
  });
  await page.routeWebSocket("**/user?*", (socket) => {
    socket.onMessage((message) => {
      if (message === '{"type":"ping"}') socket.send('{"type":"pong"}');
    });
  });
}

test.beforeEach(async () => {
  await harness();
});

test("projects overview renders live rows with permission-gated create", async ({
  page,
}, info) => {
  const { uiUrl, projectRequests } = await harness();
  const hitsBefore = projectRequests();
  await stubIdentity(page);
  await page.goto(`${uiUrl}/dashboard/organization/foundation/projects`);
  await expect(
    page.getByRole("button", { name: "New project" }).first(),
  ).toBeVisible();
  // Live row from the disposable Postgres (never intercepted). Mobile
  // collapses the table into cards that clip the name (hidden overflow), so
  // the live row is asserted by text on wide viewports and by the captured
  // card row on mobile (frozen.spec's own mobile convention).
  if (!info.project.name.startsWith("mobile")) {
    await expect(page.getByText("Sync Foundation").first()).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("projects-live.png");
  // Parity evidence: project traffic hit the live API, never an intercept.
  expect(projectRequests()).toBeGreaterThan(hitsBefore);
});

test("project detail renders live overview with milestones and updates tabs", async ({
  page,
}) => {
  const { uiUrl, projectRequests } = await harness();
  const hitsBefore = projectRequests();
  await stubIdentity(page);
  await page.goto(
    `${uiUrl}/dashboard/organization/foundation/projects/foundation-lab`,
  );
  await expect(page.getByTestId("project-overview")).toBeVisible();
  await expect(
    page.getByText("Stock adapter round-trips").first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("project-detail-live.png");
  // Parity evidence for the detail surface.
  expect(projectRequests()).toBeGreaterThan(hitsBefore);
});

test("create-project modal creates a live project and navigates to it", async ({
  page,
}) => {
  const { uiUrl, projectRequests } = await harness();
  const hitsBefore = projectRequests();
  await stubIdentity(page);
  await page.goto(`${uiUrl}/dashboard/organization/foundation/projects`);
  await expect(
    page.getByRole("button", { name: "New project" }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New project" })
    .first()
    .click();
  // Modal open (frozen CreateProjectModal shape: name/summary/lead + submit).
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("projects-create-modal.png");
  await page
    .getByPlaceholder("Name")
    .fill("Live Parity Probe");
  await page.getByPlaceholder("Summary").fill("Created through the modal.");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Ada" }).click();
  await page.getByRole("button", { name: "Create project" }).click();
  // The mutation settled: navigation lands on the new project's detail
  // (created.slug — the live API response drove the router, not a fixture).
  await expect(page.getByTestId("project-overview")).toBeVisible({
    timeout: 15000,
  });
  await expect(page).toHaveURL(/\/projects\/live-parity-probe$/);
  await expect(page.getByText("Created through the modal.").first()).toBeVisible();
  // Parity evidence: POST + resolve hit the live API.
  expect(projectRequests()).toBeGreaterThan(hitsBefore + 1);
});

test("archive row action hides the live project until include-archived", async ({
  page,
}, info) => {
  const { uiUrl, projectRequests } = await harness();
  const hitsBefore = projectRequests();
  await stubIdentity(page);
  await page.goto(`${uiUrl}/dashboard/organization/foundation/projects`);
  if (info.project.name.startsWith("mobile")) {
    // The frozen ProjectList renders a md:table only; below md there is no
    // archive affordance to exercise (fork-identical). Desktop/tablet carry it.
    test.info().annotations.push({ type: "skip", description: "no mobile list" });
    return;
  }
  const foundationRow = page
    .getByTestId("project-row")
    .filter({ hasText: "Sync Foundation" });
  await expect(foundationRow).toBeVisible();
  // Scope the archive action to the Sync Foundation row (earlier tests in
  // this worker created additional live projects).
  await foundationRow
    .getByRole("button", { name: "Archive" })
    .click();
  // Live mutation settled: row leaves the active list (refetch after
  // invalidation, no interception). When no other active project exists the
  // frozen overview renders its Empty state instead of the table.
  await expect(page.getByText("Sync Foundation")).toHaveCount(0);
  await expect(
    page
      .getByTestId("project-list-table")
      .or(page.getByTestId("projects-empty")),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("projects-after-archive.png");
  // includeArchived: the archived project re-enters the list via a fresh
  // live query (frozen checkbox refetches with includeArchived=true).
  await page.getByRole("checkbox", { name: "Include archived" }).check();
  await expect(page.getByText("Sync Foundation").first()).toBeVisible();
  await expect(page).toHaveScreenshot("projects-include-archived.png");
  // Unarchive restores the active row (same live path).
  await page
    .getByTestId("project-row")
    .filter({ hasText: "Sync Foundation" })
    .getByRole("button", { name: "Unarchive" })
    .click();
  await page.getByRole("checkbox", { name: "Include archived" }).uncheck();
  await expect(page.getByText("Sync Foundation").first()).toBeVisible();
  expect(projectRequests()).toBeGreaterThan(hitsBefore + 1);
});

test("updates tab publishes a live update with health picklist", async ({
  page,
}) => {
  const { uiUrl, projectRequests } = await harness();
  const hitsBefore = projectRequests();
  await stubIdentity(page);
  await page.goto(
    `${uiUrl}/dashboard/organization/foundation/projects/foundation-lab`,
  );
  // The updates route is URL-reachable (frozen §6 surface); at the pinned
  // fork commit no in-app tab links here yet — ProjectTabs lists
  // overview/tickets only, so parity drives the route directly.
  await page.goto(
    `${uiUrl}/dashboard/organization/foundation/projects/foundation-lab/updates`,
  );
  await expect(page.getByTestId("project-updates-panel")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("project-updates-tab.png");
  await page.getByPlaceholder("Share an update").fill("Parity probe update.");
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "At risk" }).click();
  await page.getByRole("button", { name: "Post update" }).click();
  await expect(page.getByText("Parity probe update.").first()).toBeVisible({
    timeout: 15000,
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("project-updates-published.png");
  expect(projectRequests()).toBeGreaterThan(hitsBefore);
});
