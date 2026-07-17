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

async function signIn(page: Page) {
  if (!username || !password) throw new Error("dev credentials were not supplied");
  await page.goto(baseURL);
  await page.evaluate(() => localStorage.clear());
  const status = await page.evaluate(async ({ username, password }) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.status;
  }, { username, password });
  expect(status).toBe(200);
  await page.reload();
  await expect(page.locator(".app")).toBeVisible({ timeout: 15_000 });
}

test("live dev interactions", async ({ page }) => {
  await signIn(page);

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
  await signIn(page);

  const fixture = await page.evaluate(async () => {
    const requestJson = async (url: string, init?: RequestInit) => {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url}: HTTP ${response.status}`);
      return response.json();
    };
    const organizations = await requestJson("/api/organizations");
    const organizationId = organizations.organizations?.[0]?.id as string | undefined;
    if (!organizationId) throw new Error("project-workspace e2e requires an organization");
    const scope = `/api/organizations/${organizationId}`;
    const [projects, sessions] = await Promise.all([
      requestJson(`${scope}/projects`),
      requestJson(`${scope}/sessions?managed=true&archived=false&limit=500`),
    ]);
    let project = (projects.projects ?? []).find(
      (candidate: { name?: string }) => candidate.name === "QA E2E",
    );
    if (!project) {
      project = await requestJson(`${scope}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "QA E2E" }),
      });
    }
    const memberIds = (sessions.sessions ?? [])
      .filter((session: { projectId?: string | null }) => session.projectId === project.id)
      .map((session: { id: string }) => session.id);
    while (memberIds.length < 2) {
      const session = await requestJson(`${scope}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const association = await fetch(`${scope}/sessions/${session.id}/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!association.ok) {
        throw new Error(`could not associate E2E session: HTTP ${association.status}`);
      }
      memberIds.push(session.id);
    }
    const reset = await fetch(`${scope}/projects/${project.id}/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: null }),
    });
    if (!reset.ok) throw new Error(`could not reset E2E project layout: HTTP ${reset.status}`);
    return { projectId: project.id as string, memberIds };
  });
  await page.goto(`${baseURL}/sessions/projects/${encodeURIComponent(fixture.projectId)}`);
  await expect(page).toHaveURL(/\/sessions\/projects\//);

  const rows = page.locator(".srow[data-session-id]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  const singleSessionId = fixture.memberIds[0];

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
  const paneFill = await page.locator(".chat-view").evaluateAll((chats) =>
    chats.map((chat) => chat.getBoundingClientRect().height / chat.parentElement!.getBoundingClientRect().height),
  );
  expect(paneFill.every((ratio) => ratio >= 0.95)).toBe(true);

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
  const restoredFill = await page.locator(".chat-view").evaluateAll((chats) =>
    chats.map((chat) => chat.getBoundingClientRect().height / chat.parentElement!.getBoundingClientRect().height),
  );
  expect(restoredFill.every((ratio) => ratio >= 0.95)).toBe(true);

  await page.goto(`${baseURL}/sessions/${encodeURIComponent(singleSessionId!)}`);
  await expect(page.locator(".sessions-dockview")).toHaveCount(0);
  await expect(page.locator(".chat-view")).toHaveCount(1);
});
