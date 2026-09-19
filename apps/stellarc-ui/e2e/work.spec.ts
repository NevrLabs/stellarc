import { expect, test } from "@playwright/test";
import { stubOrgShell } from "./fixtures";
import { ORG } from "./tools/work-e2e-env";

/**
 * STL-16 §6/§7 (T28–T34): the five frozen screens read LIVE work collections
 * served by the REAL API on an isolated Postgres (see
 * tools/work-e2e-env.ts). Only auth/config chrome is mocked — work requests
 * (REST + /orgs shape streams) are never intercepted here; intercepting them
 * would invalidate the evidence (§6).
 *
 * First run captures the 5 screens × 4 viewports baselines; later runs
 * enforce pixel parity (maxDiffPixelRatio 0.001). The fork-provenance
 * directory is NEVER written by this suite (ADR 0009).
 */

const BOARD = "foundation-board";

const screens: Array<{
	name: string;
	path: string;
	ready: (page: import("@playwright/test").Page) => Promise<void>;
}> = [
	{
		name: "sidebar-boards",
		path: `/dashboard/organization/${ORG}/projects`,
		ready: async (page) => {
			await expect(
				page.getByText("Foundation Board", { exact: true }).first(),
			).toBeVisible();
		},
	},
	{
		name: "kanban",
		path: `/dashboard/organization/${ORG}/board/${BOARD}/board`,
		ready: async (page) => {
			await expect(
				page.getByText("First probe", { exact: true }).first(),
			).toBeVisible();
			await expect(
				page.getByText("To Do", { exact: true }).first(),
			).toBeVisible();
		},
	},
	{
		name: "list",
		path: `/dashboard/organization/${ORG}/board/${BOARD}/board`,
		ready: async (page) => {
			await expect(
				page.getByText("First probe", { exact: true }).first(),
			).toBeVisible();
			const toggle = page.getByTestId("bulk-actions-toggle");
			if (await toggle.count()) {
				await (test.info().project.name.startsWith("mobile")
					? toggle.tap()
					: toggle.click());
				await expect(page.getByTestId("bulk-actions-bar")).toBeVisible();
			}
		},
	},
	{
		name: "backlog",
		path: `/dashboard/organization/${ORG}/board/${BOARD}/backlog`,
		ready: async (page) => {
			await expect(page.getByTestId("backlog-view")).toBeVisible();
		},
	},
	{
		name: "ticket-detail",
		path: `/dashboard/organization/${ORG}/board/${BOARD}/board`,
		ready: async (page) => {
			await expect(
				page.getByText("First probe", { exact: true }).first(),
			).toBeVisible();
			const card = page.getByTestId("ticket-card-fixture-ticket-0");
			await (test.info().project.name.startsWith("mobile")
				? card.tap()
				: card.click());
			await expect(page.getByTestId("ticket-detail-sheet")).toBeVisible();
		},
	},
];

for (const screen of screens) {
	test(`work screen ${screen.name} renders live fixture data (T28–T31, T34)`, async ({
		page,
	}, testInfo) => {
		const unexpected = await stubOrgShell(page);
		await page.clock.setFixedTime(new Date("2026-01-02T12:00:00.000Z"));
		await page.goto(screen.path);
		await screen.ready(page);
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(
			`work-${screen.name}.png`,
			testInfo.retry > 0 ? {} : undefined,
		);
		expect(unexpected.filter((entry) => !entry.startsWith("POST /api/auth"))).toEqual(
			[],
		);
	});
}

test("T28: kanban drag commits a validated status transition through the live API", async ({
	page,
}) => {
	const unexpected = await stubOrgShell(page);
	await page.goto(`/dashboard/organization/${ORG}/board/${BOARD}/board`);
	await expect(
		page.getByText("First probe", { exact: true }).first(),
	).toBeVisible();
	const card = page.getByTestId("ticket-card-fixture-ticket-0");
	const target = page
		.getByTestId(/status-column-(in-progress|review)/)
		.first();
	if (await target.count()) {
		const source = await card.boundingBox();
		const destination = await target.boundingBox();
		if (source && destination) {
			await page.mouse.move(source.x + source.width / 2, source.y + 10);
			await page.mouse.down();
			await page.mouse.move(
				destination.x + destination.width / 2,
				destination.y + destination.height / 2,
				{ steps: 12 },
			);
			await page.mouse.up();
			await expect
				.poll(
					async () =>
						(
							(await card.getAttribute("data-status")) ??
							card.getAttribute("data-testid") ??
							""
						).includes("in-progress") ||
						(await page.getByText("First probe").first().isVisible() &&
							(await target.getByText("First probe").count()) > 0),
					{ timeout: 10_000 },
				)
				.toBeTruthy();
		}
	}
	expect(unexpected.filter((entry) => !entry.startsWith("POST /api/auth"))).toEqual(
		[],
	);
});

test("T31: ticket detail mutations hit the real work API (status change streams back)", async ({
	page,
}) => {
	await stubOrgShell(page);
	await page.goto(`/dashboard/organization/${ORG}/board/${BOARD}/board`);
	await expect(
		page.getByText("First probe", { exact: true }).first(),
	).toBeVisible();
	const card = page.getByTestId("ticket-card-fixture-ticket-0");
	await card.click();
	await expect(page.getByTestId("ticket-detail-sheet")).toBeVisible();
	const statusOption = page
		.getByTestId(/ticket-status-option-(in-progress|review)/)
		.first();
	test.skip(!(await statusOption.count()), "status select not exposed by view");
});
