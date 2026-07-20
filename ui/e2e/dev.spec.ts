import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const baseURL = process.env.OLYMPUS_DEV_BASE_URL ?? "http://127.0.0.1:5177";
const username = process.env.OLYMPUS_DEV_USERNAME;
const password = process.env.OLYMPUS_DEV_PASSWORD;
const evidenceDir = process.env.OLYMPUS_EVIDENCE_DIR;

async function capture(page: Page, name: string) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true });
}

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

  await expect(page.locator(".env-pill")).toHaveText("dev");
  const body = page.locator(".body");
  const sidebarCycle = page.locator("[data-sidebar-cycle]");
  await expect(body).toHaveAttribute("data-sidebar-mode", "full");
  const expandedWidth = (await page.locator("aside.sidebar").boundingBox())!.width;
  expect(expandedWidth).toBeGreaterThan(160);
  await capture(page, "sidebar-full-obsidian.png");

  await sidebarCycle.click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "compact");
  await expect(page.locator("aside.sidebar")).toHaveClass(/\bcompact\b/);
  expect((await page.locator("aside.sidebar").boundingBox())!.width).toBe(48);
  await expect(page.getByText("Agents", { exact: true })).not.toBeVisible();

  for (const surface of ["Vaults", "Projects", "Fleet", "Settings", "Sessions"]) {
    await page.locator(`.layouts button[aria-label="${surface}"]`).click();
    await expect(body).toHaveAttribute("data-sidebar-mode", "compact");
    const compactSidebar = page.locator("aside.sidebar");
    await expect(compactSidebar).toHaveClass(/\bcompact\b/);
    expect((await compactSidebar.boundingBox())!.width).toBe(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const namedTarget = surface === "Vaults"
      ? compactSidebar.locator("button[aria-label^='Vault:']")
      : surface === "Projects"
        ? compactSidebar.getByRole("button", { name: "All Cards" })
        : surface === "Fleet"
          ? compactSidebar.getByRole("button", { name: "Add node" })
          : surface === "Sessions"
            ? compactSidebar.locator(".srow[data-session-id]").first()
            : compactSidebar.locator(".sidebar-compact-placeholder[title='Settings']");
    await expect(namedTarget).toBeVisible();
    await expect(namedTarget).toHaveAttribute("title", /\S+/);
    if (surface !== "Settings") {
      await namedTarget.focus();
      await expect(namedTarget).toBeFocused();
    }
  }
  await capture(page, "sidebar-compact-obsidian.png");

  await page.reload();
  await expect(body).toHaveAttribute("data-sidebar-mode", "compact");
  await page.setViewportSize({ width: 820, height: 844 });
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(body).toHaveAttribute("data-sidebar-mode", "compact");
  await sidebarCycle.click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
  await expect(page.locator("aside.sidebar")).toHaveCount(0);
  await capture(page, "sidebar-hidden-obsidian.png");
  await sidebarCycle.click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "full");
  expect((await page.locator("aside.sidebar").boundingBox())!.width).toBe(expandedWidth);

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
  await capture(page, "sidebar-full-daybreak.png");
});

test("phone sidebar stays a full-or-hidden drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const body = page.locator(".body");
  const sidebarCycle = page.locator("[data-sidebar-cycle]");
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
  await expect(page.locator("aside.sidebar")).toHaveCount(0);

  await sidebarCycle.click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "full");
  await expect(page.locator("aside.sidebar")).toBeVisible();
  await expect(page.locator("aside.sidebar")).not.toHaveClass(/\bcompact\b/);
  await expect(page.locator(".sidebar-scrim")).toBeVisible();
  await expect(page.locator(".viewport")).toHaveAttribute("inert", "");
  await expect(page.locator(".topbar")).toHaveAttribute("inert", "");
  await expect(page.locator("aside.sidebar")).toHaveAttribute("aria-modal", "true");
  await capture(page, "sidebar-mobile-drawer.png");

  const drawerControls = page.locator("aside.sidebar button:not([disabled]):visible, aside.sidebar [tabindex='0']:visible");
  const firstDrawerControl = drawerControls.first();
  const lastDrawerControl = drawerControls.last();
  await firstDrawerControl.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(lastDrawerControl).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(firstDrawerControl).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
  await expect(sidebarCycle).toBeFocused();

  await sidebarCycle.click();
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
  await expect(page.locator("aside.sidebar")).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 844 });
  await expect(body).toHaveAttribute("data-sidebar-mode", "full");
  await page.setViewportSize({ width: 820, height: 844 });
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
});

test("phone vault action closes the same-path drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.locator('.layouts button[aria-label="Vaults"]').click();
  const body = page.locator(".body");
  await page.locator("[data-sidebar-cycle]").click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "full");
  await page.getByRole("button", { name: /^Vault:/ }).click();
  await page.getByRole("menuitem", { name: "Create vault…" }).click();
  await expect(body).toHaveAttribute("data-sidebar-mode", "hidden");
  await expect(page.getByRole("dialog", { name: "Create vault" })).toBeVisible();
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
