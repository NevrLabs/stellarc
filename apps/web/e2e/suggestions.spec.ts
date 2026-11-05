import { expect, type Page, test } from "@playwright/test";

/**
 * NEVR-498 onboarding-suggestion proofs (home / first-run):
 *  1. recorded activity renders suggestions whose evidence names the data
 *     ("N tasks ran here in the last 7 days") and whose single action lands
 *     where the work happened
 *  2. zero recorded activity degrades to the honest empty state
 *  3. a dismissed suggestion stays dismissed across reload (never re-promotes)
 *  4. activity with everything dismissed renders nothing — "nothing here yet"
 *     is reserved for zero activity, not for the user's own choices
 *
 * The fixtures live in late Oct / early Nov 2026, so the clock is pinned
 * inside that world (2026-11-05 noon UTC) to make the 7-day window
 * deterministic: Engineering = NEVR-421/229/430 (3), Design = NEVR-150 (1),
 * Triage = none in window.
 */

/** The prerendered HTML is interactive only after React attaches; wait for it. */
async function hydrated(page: Page) {
	await expect(page.locator("html[data-hydrated='1']")).toBeAttached({
		timeout: 15000,
	});
}

async function pinnedClock(page: Page) {
	await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
}

test("home renders suggestions with evidence derived from recorded activity", async ({
	page,
}) => {
	await pinnedClock(page);
	await page.goto("/");
	await hydrated(page);

	await expect(page.getByTestId("suggestions")).toBeVisible();
	const cards = page.getByTestId("suggestion");
	await expect(cards).toHaveCount(2);

	// Busiest workspace first, evidence naming the recorded tasks exactly.
	await expect(cards.nth(0)).toContainText("Engineering");
	await expect(cards.nth(0).getByTestId("suggestion-evidence")).toHaveText(
		"3 tasks ran here in the last 7 days",
	);
	await expect(cards.nth(1)).toContainText("Design");
	await expect(cards.nth(1).getByTestId("suggestion-evidence")).toHaveText(
		"1 task ran here in the last 7 days",
	);

	// One action away from use: Open lands on the board the tasks ran in.
	await cards.nth(0).getByTestId("suggestion-open").click();
	await expect(page).toHaveURL(/\/resources\?item=board-eng/);
	await expect(page.getByTestId("board-body")).toBeVisible();
});

test("zero recorded activity degrades to the honest empty state", async ({
	page,
}) => {
	await pinnedClock(page);
	await page.goto("/");
	await hydrated(page);
	await expect(page.getByTestId("suggestions")).toBeVisible();

	// Wipe the instance's recorded activity through the same collection seam
	// the app reads (page-local devtools handle, data/devtools.ts).
	await page.evaluate(() => {
		const tickets = window.__stellarc?.collections.tickets;
		if (!tickets) throw new Error("devtools collections missing");
		tickets.delete([...tickets.state.keys()]);
	});

	await expect(page.getByTestId("suggestion")).toHaveCount(0);
	await expect(page.getByTestId("suggestions")).toHaveCount(0);
	const empty = page.getByTestId("suggestions-empty");
	await expect(empty).toBeVisible();
	await expect(empty).toContainText(/nothing here yet/i);
	// The rest of home still works — this is degradation, not breakage.
	await expect(page.getByTestId("inbox-view")).toBeVisible();
});

test("a dismissed suggestion stays dismissed across reload", async ({
	page,
}) => {
	await pinnedClock(page);
	await page.goto("/");
	await hydrated(page);

	const cards = page.getByTestId("suggestion");
	await expect(cards).toHaveCount(2);

	await cards.nth(0).getByTestId("suggestion-dismiss").click();
	await expect(cards).toHaveCount(1);
	await expect(cards.nth(0)).toContainText("Design");

	// Persisted client-side, per user.
	await expect
		.poll(() =>
			page.evaluate(() =>
				localStorage.getItem("stellarc.suggestions.dismissed"),
			),
		)
		.toContain("board-eng");

	await page.reload();
	await pinnedClock(page);
	await hydrated(page);

	// Never re-promotes: Engineering stays gone, the other suggestion stays.
	await expect(page.getByTestId("suggestion")).toHaveCount(1);
	await expect(page.getByTestId("suggestion").nth(0)).toContainText("Design");
	await expect(page.getByTestId("suggestion").nth(0)).not.toContainText(
		"Engineering",
	);
});

test("activity with everything dismissed renders nothing (no fake empty state)", async ({
	page,
}) => {
	await pinnedClock(page);
	await page.goto("/");
	await hydrated(page);

	const cards = page.getByTestId("suggestion");
	await expect(cards).toHaveCount(2);
	await cards.nth(0).getByTestId("suggestion-dismiss").click();
	await cards.nth(0).getByTestId("suggestion-dismiss").click();

	// Silent — the honest "nothing here yet" line belongs to zero activity.
	await expect(page.getByTestId("suggestions")).toHaveCount(0);
	await expect(page.getByTestId("suggestions-empty")).toHaveCount(0);
	await expect(page.getByTestId("inbox-view")).toBeVisible();
});
