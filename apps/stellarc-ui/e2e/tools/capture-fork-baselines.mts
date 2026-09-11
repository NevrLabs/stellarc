// Capture Playwright screenshot baselines from the LIVE Kaneo fork at the pinned SHA.
// Provenance only: 21 screens × 4 viewports. Not Playwright assertion baselines.
// Run from /home/rpw/repos/kaneo so @playwright/test resolves.

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = "https://kaneo.entelechia.cloud";
const OUT = process.env.OUT ?? "/tmp/stellarc-baselines";
const ORG = "nevrlabs";
const BOARD = "KTEST"; // has tickets; see STL-14 spec fixtures
const PROJECTS = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
  },
  {
    name: "tablet",
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    ua: devices["iPhone 14"].userAgent,
    dsf: 3,
  },
  {
    name: "mobile-small",
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    isMobile: true,
    dsf: 2,
  },
];
// screen name → route (relative). Order matches the spec §5 inventory.
const SCREENS: Record<string, string> = {
  "sign-in": "/auth/sign-in",
  "org-shell": `/dashboard/organization/${ORG}/projects`,
  "my-tickets": `/dashboard/organization/${ORG}/my-tasks`,
  inbox: `/dashboard/organization/${ORG}/inbox`,
  kanban: `/dashboard/organization/${ORG}/board/${BOARD}/board`,
  list: `/dashboard/organization/${ORG}/board/${BOARD}/board#viewMode=list`,
  backlog: `/dashboard/organization/${ORG}/board/${BOARD}/backlog`,
  calendar: `/dashboard/organization/${ORG}/board/${BOARD}/calendar`,
  gantt: `/dashboard/organization/${ORG}/board/${BOARD}/gantt`,
  milestones: `/dashboard/organization/${ORG}/board/${BOARD}/milestones`,
  "ticket-detail": `/dashboard/organization/${ORG}/board/${BOARD}/board?taskId=__FIRST__`,
  "repo-list": `/dashboard/organization/${ORG}/repo`,
  "repo-issues": `/dashboard/organization/${ORG}/repo/__REPO__/issues`,
  "repo-pulls": `/dashboard/organization/${ORG}/repo/__REPO__/pulls`,
  "repo-pull-detail": `/dashboard/organization/${ORG}/repo/__REPO__/pulls/__PR__`,
  projects: `/dashboard/organization/${ORG}/projects`,
  "project-detail": `/dashboard/organization/${ORG}/projects/__PROJECT__`,
  members: "/dashboard/settings/organization/members",
  teams: "/dashboard/settings/organization/teams",
  roles: "/dashboard/settings/organization/roles",
  developer: "/dashboard/settings/account/developer",
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const manifest: Record<
  string,
  Record<string, { route: string; url: string; bytes: number; note?: string }>
> = {};

// Resolve dynamic ids once, from the desktop authed context.
const probe = await browser.newContext({
  storageState: "tests/e2e/.auth/user.json",
  viewport: { width: 1440, height: 900 },
});
const pp = await probe.newPage();
const settled = async (url: string) => {
  await pp.goto(url, { waitUntil: "networkidle" });
  await pp
    .waitForFunction(
      () =>
        document.body.innerText.trim().length > 40 &&
        !document.querySelector('[class*="skeleton"],.animate-pulse'),
      null,
      { timeout: 25000 },
    )
    .catch(() => {});
  await pp.waitForTimeout(400);
};
const firstHref = (sel: string, marker: string) =>
  pp.evaluate(
    ([sel, marker]) => {
      const a = (
        [...document.querySelectorAll(sel)] as HTMLAnchorElement[]
      ).find((x) => x.href.includes(marker));
      return a ? a.href.split(marker)[1].split(/[/?#]/)[0] : "";
    },
    [sel, marker] as const,
  );
await settled(`${BASE}/dashboard/organization/${ORG}/board/${BOARD}/board`);
const firstTask =
  (await firstHref('a[href*="/task/"]', "/task/")) ||
  (await firstHref('a[href*="taskId="]', "taskId="));
// Repo cards and project rows navigate via onClick (no <a>); ids come from the DB, injected by the runner.
const repoSlug = process.env.REPO_ID ?? "";
const prNum = process.env.PR_NUMBER ?? "";
const projectSlug = process.env.PROJECT_SLUG ?? "";
await probe.close();
console.log("resolved:", { firstTask, repoSlug, prNum, projectSlug });

const DYN = new Set([
  "ticket-detail",
  "repo-issues",
  "repo-pulls",
  "repo-pull-detail",
  "project-detail",
]);
const only = process.env.ONLY_DYNAMIC ? DYN : null;
for (const P of PROJECTS) {
  mkdirSync(`${OUT}/${P.name}`, { recursive: true });
  manifest[P.name] = {};
  for (const [name, routeT] of Object.entries(SCREENS)) {
    if (only && !only.has(name)) continue;
    const route = routeT
      .replace("__FIRST__", firstTask)
      .replace("__REPO__", repoSlug)
      .replace("__PR__", prNum)
      .replace("__PROJECT__", projectSlug);
    const authed = name !== "sign-in";
    const ctx = await browser.newContext({
      ...(authed ? { storageState: "tests/e2e/.auth/user.json" } : {}),
      viewport: P.viewport,
      hasTouch: P.hasTouch,
      isMobile: P.isMobile,
      deviceScaleFactor: P.dsf ?? 1,
      userAgent: P.ua,
      colorScheme: "dark",
      locale: "en-US",
      timezoneId: "Asia/Jakarta",
    });
    const page = await ctx.newPage();
    // freeze time-relative text so baselines are stable
    await page.clock.setFixedTime(new Date("2026-09-09T00:00:00Z"));

    let note: string | undefined;
    try {
      const m = route.match(/#viewMode=(\w+)$/);
      const nav = route.replace(/#viewMode=\w+$/, "");
      if (m)
        await page.addInitScript((mode) => {
          try {
            const k = "user-preferences";
            const cur = JSON.parse(
              localStorage.getItem(k) ?? '{"state":{},"version":0}',
            );
            cur.state = { ...(cur.state ?? {}), viewMode: mode };
            localStorage.setItem(k, JSON.stringify(cur));
          } catch {}
        }, m[1]);
      await page.goto(BASE + nav, { waitUntil: "networkidle", timeout: 45000 });
      // networkidle fires before this SPA paints. Wait for a real anchor: the app sidebar or auth form, then for
      // the main region to contain text and no skeletons. Fail loudly if nothing renders in 25s.
      await page.waitForFunction(
        () => {
          const txt = (document.body.innerText ?? "").trim();
          if (txt === "Not Found") return true; // real 404 → capture it, flag below
          const skel = document.querySelectorAll(
            '[class*="skeleton"],[data-slot="skeleton"],.animate-pulse',
          ).length;
          return txt.length > 40 && skel === 0;
        },
        null,
        { timeout: 25000 },
      );
      await page.waitForTimeout(500);
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
      });
      const path = `${OUT}/${P.name}/${name}.png`;
      await page.screenshot({ path, fullPage: false });
      const bytes = (await import("node:fs")).statSync(path).size;
      const body = await page.evaluate(() =>
        (document.body.innerText ?? "").trim(),
      );
      const note =
        body === "Not Found"
          ? "ROUTE 404"
          : body.length < 40
            ? `SUSPICIOUS textLen=${body.length}`
            : undefined;
      manifest[P.name][name] = { route, url: page.url(), bytes, note };
    } catch (e) {
      note = String(e).slice(0, 160);
      manifest[P.name][name] = { route, url: "", bytes: 0, note };
    }
    await ctx.close();
    process.stdout.write(`${P.name}/${name} ${note ? "FAIL " + note : "ok"}\n`);
  }
}
if (only) {
  try {
    const prev = JSON.parse(
      (await import("node:fs")).readFileSync(`${OUT}/manifest.json`, "utf8"),
    );
    for (const P of PROJECTS)
      manifest[P.name] = { ...prev.screens[P.name], ...manifest[P.name] };
  } catch {}
}
writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify(
    {
      source: BASE,
      sha: "2504e64512b84b9b739d4d4fb0d4ceaefdb14783",
      capturedAt: new Date().toISOString(),
      resolved: { firstTask, repoSlug, prNum, projectSlug },
      screens: manifest,
    },
    null,
    2,
  ),
);
await browser.close();
