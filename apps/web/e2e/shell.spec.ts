import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const ARTIFACTS = path.join(import.meta.dirname, "artifacts");

/**
 * NEVR-433 shell proofs at 1440x900:
 *  1. shell renders (header org/tabs/search/avatar, rail, sidebar + Recent, workspace)
 *  2. screenshots in both themes
 *  3. the search box keeps its fixed width with 20 tabs open — the tab strip
 *     absorbs all pressure; search is flex:none
 */

/** The prerendered HTML is interactive only after React attaches; wait for it. */
async function hydrated(page: Page) {
	await expect(page.locator("html[data-hydrated='1']")).toBeAttached({
		timeout: 15000,
	});
}

test("shell renders header, rail, sidebar with pinned Recent, and workspace", async ({
	page,
}) => {
	await page.goto("/resources?item=board-eng");
	await hydrated(page);
	await expect(page.getByTestId("search")).toBeVisible();
	await expect(page.getByTestId("avatar-initials")).toBeVisible();
	await expect(page.getByTestId("rail-resources")).toHaveClass(/on/);
	await expect(page.getByTestId("recent-footer")).toBeVisible();
	await expect(page.getByTestId("board-body")).toBeVisible();
	await expect(page.locator(".card").first()).toBeVisible();
	await expect(page.getByTestId("tab").first()).toBeVisible();
});

test("captures 1440x900 screenshots in both themes", async ({
	page,
}, testInfo) => {
	await page.goto("/resources?item=board-eng");
	await hydrated(page);
	await expect(page.locator(".card").first()).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	const dark = path.join(ARTIFACTS, "shell-dark-graphite-1440x900.png");
	await page.screenshot({ path: dark, fullPage: false });
	await testInfo.attach("shell-dark-graphite", { path: dark });

	await page.getByTestId("theme-toggle").click();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	await expect(page.locator(".card").first()).toBeVisible();
	const light = path.join(ARTIFACTS, "shell-light-paper-1440x900.png");
	await page.screenshot({ path: light, fullPage: false });
	await testInfo.attach("shell-light-paper", { path: light });
});

test("search box width is unchanged with 20 tabs open", async ({ page }) => {
	await page.goto("/resources?item=board-eng");
	await hydrated(page);
	await expect(page.getByTestId("tab").first()).toBeVisible();

	const search = page.getByTestId("search");
	const widthBefore = (await search.boundingBox())?.width;
	expect(widthBefore).toBeCloseTo(232, 0);

	// Open tabs until 20 exist (Ctrl+T equivalent: the + button).
	for (let i = 0; (await page.getByTestId("tab").count()) < 20 && i < 30; i++) {
		await page.getByTestId("newtab").click();
	}
	await expect(page.getByTestId("tab")).toHaveCount(20);

	// The tab strip is under heavy pressure now; the search box must not move.
	const boxAfter = await search.boundingBox();
	expect(boxAfter?.width).toBeCloseTo(widthBefore ?? 0, 0);

	// Overflowing tabs clip and surface an +N count instead of pushing content.
	await expect(page.getByTestId("tabs-more")).toHaveClass(/show/);
});

test("Agents view is hidden behind a flag", async ({ page }) => {
	await page.goto("/");
	await hydrated(page);
	await expect(page.getByTestId("rail-home")).toBeVisible();
	await expect(page.getByTestId("rail-agents")).toHaveCount(0);

	// Direct URL also redirects home while the flag is off.
	await page.goto("/agents");
	await hydrated(page);
	await expect(page).not.toHaveURL(/agents/);

	await page.evaluate(() => localStorage.setItem("stellarc.flags.agents", "1"));
	await page.reload();
	await hydrated(page);
	await expect(page.getByTestId("rail-agents")).toBeVisible();
});

test("board views all render from fixtures", async ({ page }) => {
	for (const view of [
		"list",
		"timeline",
		"backlog",
		"calendar",
		"agentwork",
		"mine",
	]) {
		await page.goto(`/resources?item=board-eng&view=${view}`);
		await hydrated(page);
		await expect(page.getByTestId(`${view}-body`)).toBeVisible();
	}
});
