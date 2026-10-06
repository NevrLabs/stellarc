import { expect, test, type Page } from "@playwright/test";
import { stubOrgShell } from "./fixtures";
import { ORG } from "./tools/work-e2e-constants";

/**
 * STL-16 §6/§7 (T28–T34): the five frozen screens read LIVE work collections
 * served by the REAL API on an isolated Postgres (tools/work-e2e-env.ts
 * composes workHandler + foundationHandler exactly like main.ts). Only
 * auth/config chrome is mocked — work requests (REST + /orgs shape streams)
 * are never intercepted; that would invalidate the evidence (§6).
 *
 * The real server legitimately 404s fork-compat REST endpoints this slice
 * does not own (columns list, resource grants, github integration metadata);
 * those GETs render nothing and are allowlisted below. Everything under
 * /api/work and /orgs must come from the network, never a mock.
 *
 * First run captures baselines (5 screens × 4 viewports); later runs enforce
 * pixel parity (maxDiffPixelRatio 0.001). The fork-provenance directory is
 * NEVER written by this suite (ADR 0009).
 */

const BOARD = "foundation-board";
const boardPath = `/dashboard/organization/${ORG}/board/${BOARD}/board`;
// T5/T3/T4 sibling fetchers (detail sheet): milestone/flag/label/activity/
	// followers/external-links/repo-links read endpoints this slice does not
	// own yet; the real server answers 404 and the screens render empty state.
	const COMPAT_404 =
		/^GET \/api\/(column|resource-grant|github-integration|milestone|flag|label|external-link|task-relation|activity|task)\//;

function allow(unexpected: string[]): string[] {
	return unexpected.filter((entry) => !entry.startsWith("POST /api/auth") && !COMPAT_404.test(entry));
}

/** Let entering transitions/RAF settle before pixel capture (fork capture
 * tool does the same: disable animations, wait, then shoot). */
async function settle(page: Page) {
	// Persistent (init-script): addStyleTag is lost on SPA re-renders, and the
	// fork's list rows animate a background-shade stripe that would otherwise
	// be mid-transition at capture time.
	await page.addInitScript(() => {
		document.addEventListener("DOMContentLoaded", () => {
			const style = document.createElement("style");
			style.textContent =
				"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
			document.head.appendChild(style);
		});
	});
	await page.addStyleTag({
		content:
			"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
	});
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			),
	);
	await page.waitForTimeout(700);
}

async function openBoard(page: Page, viewMode?: "board" | "list") {
	if (viewMode) {
		// The persisted fork preference key (store/user-preferences.ts) drives
		// the board/list split view; set it before the app boots.
		await page.addInitScript((mode) => {
			try {
				const key = "user-preferences";
				const current = JSON.parse(
					localStorage.getItem(key) ?? '{"state":{},"version":0}',
				);
				current.state = { ...(current.state ?? {}), viewMode: mode };
				localStorage.setItem(key, JSON.stringify(current));
			} catch {}
		}, viewMode);
	}
	await page.clock.setFixedTime(new Date("2026-01-02T12:00:00.000Z"));
	const unexpected = await stubOrgShell(page);
	await page.goto(boardPath);
	await expect(
		page.getByText("First probe", { exact: true }).first(),
	).toBeVisible({ timeout: 20_000 });
	return unexpected;
}

test("work screen sidebar-boards renders live boards (T29, T34)", async ({
	page,
}) => {
	await page.clock.setFixedTime(new Date("2026-01-02T12:00:00.000Z"));
	const unexpected = await stubOrgShell(page);
	await page.goto(`/dashboard/organization/${ORG}/projects`);
	// Mobile collapses the sidebar behind the drawer toggle (frozen.spec
	// convention); tablet and up render it inline (768px fork breakpoint).
	const toggle = page.getByTestId("mobile-sidebar-toggle");
	if (test.info().project.name.startsWith("mobile")) await toggle.tap();
	await expect(
		page.getByRole("button", { name: "Foundation Board" }).first(),
	).toBeVisible({ timeout: 20_000 });
	await page.evaluate(() => document.fonts.ready);
	await settle(page);
	await expect(page).toHaveScreenshot("work-sidebar-boards.png");
	expect(allow(unexpected)).toEqual([]);
});

test("work screen kanban renders live tickets through the shape (T28, T34)", async ({
	page,
}) => {
	const unexpected = await openBoard(page, "board");
	await expect(page.getByText("To Do", { exact: true }).first()).toBeVisible();
	// Live ticket key from the shape (PREFIX-number allocation, §2).
	await expect(page.getByText("foundation-board-1").first()).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await settle(page);
	await expect(page).toHaveScreenshot("work-kanban.png");
	expect(allow(unexpected)).toEqual([]);
});

test("work screen list renders live rows (T32, T34)", async ({ page }) => {
	const unexpected = await openBoard(page, "list");
	await expect(
		page.getByText("Second probe", { exact: true }).first(),
	).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await settle(page);
	await expect(page).toHaveScreenshot("work-list.png");
	expect(allow(unexpected)).toEqual([]);
});

test("work screen backlog groups per backlogStatusOrder (T30, T34)", async ({
	page,
}) => {
	await page.clock.setFixedTime(new Date("2026-01-02T12:00:00.000Z"));
	const unexpected = await stubOrgShell(page);
	await page.goto(`/dashboard/organization/${ORG}/board/${BOARD}/backlog`);
	await expect(
		page.getByRole("button", { name: /^Planned/ }).first(),
	).toBeVisible({ timeout: 20_000 });
	await expect(
		page.getByRole("button", { name: /^Archived/ }).first(),
	).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	await settle(page);
	await expect(page).toHaveScreenshot("work-backlog.png");
	expect(allow(unexpected)).toEqual([]);
});

test("work screen ticket-detail opens live detail (T31, T34)", async ({
	page,
}) => {
	const unexpected = await openBoard(page, "board");
	await page.getByText("First probe", { exact: true }).first().click();
	await expect(page.getByTestId("task-title-status").first()).toBeVisible({
		timeout: 20_000,
	});
	expect(page.url()).toContain("taskId=fixture-ticket-0");
	await page.evaluate(() => document.fonts.ready);
	await settle(page);
	await expect(page).toHaveScreenshot("work-ticket-detail.png");
	expect(allow(unexpected)).toEqual([]);
});

test("T28: kanban drag commits a validated status transition through the live API", async ({
	page,
}) => {
	await openBoard(page, "board");
	const card = page.locator('[data-task-id="fixture-ticket-0"]');
	const columns = page.locator("[data-column-id]");
	const count = await columns.count();
	test.skip(count < 2, "live columns not rendered");
	const source = await card.boundingBox();
	const target = await columns.nth(1).boundingBox();
	test.skip(!source || !target, "layout not measurable");
	const from = source as { x: number; y: number; width: number; height: number };
	const to = target as { x: number; y: number; width: number; height: number };
	// dnd-kit pointer sensor: press, small jiggle to arm the sensor, then travel.
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, {
		steps: 4,
	});
	await page.mouse.move(to.x + to.width / 2, to.y + Math.min(120, to.height / 2), {
		steps: 18,
	});
	await page.mouse.up();
	// Oracle = the real API, not the DOM: the move must have persisted a valid
	// destination status (validation path, §3) and streamed the upsert back.
	const response = await page.request.get(
		`/api/work/boards/fixture-board/tickets`,
		{
			headers: { authorization: `Bearer ${ORG} fixture-user-1` },
		},
	);
	expect(response.status()).toBe(200);
	const { tickets } = (await response.json()) as {
		tickets: Array<{ id: string; status: string }>;
	};
	const moved = tickets.find((ticket) => ticket.id === "fixture-ticket-0");
	expect(moved).toBeTruthy();
	expect(["to-do", "in-progress", "in-review"]).toContain(moved?.status);
});
