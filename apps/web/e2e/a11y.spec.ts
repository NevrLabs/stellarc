import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * NEVR-150 a11y floor at 1440x900 (the existing `desktop` project):
 * axe must find ZERO serious/critical violations on the routes the shell
 * suite already drives — `/` (home / first-run) and `/resources?item=board-eng`
 * (the board surface). Moderate/minor findings are logged to the console but
 * do not fail; the full rule set is deferred (11-03 descope steer).
 *
 * If this floor goes red, the violation gets fixed in app source or filed as
 * its own follow-up issue — never baselined here, never weakened.
 */

/** The prerendered HTML is interactive only after React attaches; wait for it. */
async function hydrated(page: Page) {
	await expect(page.locator("html[data-hydrated='1']")).toBeAttached({
		timeout: 15000,
	});
}

const FLOOR = new Set(["critical", "serious"]);

/**
 * Run the full axe analysis, log everything below the floor, and return
 * only the violations the floor gates on.
 */
async function analyzeAtFloor(page: Page) {
	const { violations } = await new AxeBuilder({ page }).analyze();
	const gated: string[] = [];
	for (const v of violations) {
		const line = `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target.join(" ")})`;
		if (v.impact && FLOOR.has(v.impact)) {
			gated.push(line);
		} else {
			console.log(`[a11y:below-floor] ${line}`);
		}
	}
	return gated;
}

test("home / first-run has zero serious/critical axe violations", async ({
	page,
}) => {
	await page.goto("/");
	await hydrated(page);
	const gated = await analyzeAtFloor(page);
	expect(gated, "serious/critical axe violations on /").toEqual([]);
});

test("board surface has zero serious/critical axe violations", async ({
	page,
}) => {
	await page.goto("/resources?item=board-eng");
	await hydrated(page);
	const gated = await analyzeAtFloor(page);
	expect(
		gated,
		"serious/critical axe violations on /resources?item=board-eng",
	).toEqual([]);
});
