import { expect, type Page, test } from "@playwright/test";

/**
 * NEVR-591 Escape-overlay law proofs (TanStack Hotkeys 0.26.0, release PR
 * #279): while focus is inside an open role="menu" (Base UI header menus —
 * apps/web's only overlay surface), hotkeys outside the overlay skip Escape
 * entirely so the overlay owns the key.
 *
 * (a) one Escape press closes the open Base UI menu and no page-level hotkey
 *     runs on it — the AppShell set (Mod+T/W/Tab/Shift+Tab) is tab-state-only,
 *     so the tab strip must be identical after the press. NOTE: apps/web has
 *     no page-level Escape hotkey (zero `Escape` bindings in src/), so the
 *     skip-half of the law has no positive observable here; the close-half is
 *     what this pins. A pre-0.26-style competing page Escape handler is
 *     exactly what would keep the menu open or close-and-run.
 *
 * (b) n/a in apps/web: no hotkey is registered with a dialog/menu scope or
 *     targets the overlay — the sole registration is the page-level AppShell
 *     set (AppShell.tsx:47). Adding a scoped one would be application code,
 *     outside this fold's scope guard.
 *
 * (c) AppShell hotkey behavior outside overlays is unchanged: hotkey-driven
 *     Mod+T opens a tab, Mod+W closes it, Mod+Tab / Mod+Shift+Tab move the
 *     active marker — pinned at keypress level, not via the + button.
 */

/** The prerendered HTML is interactive only after React attaches; wait for it. */
async function hydrated(page: Page) {
	await expect(page.locator("html[data-hydrated='1']")).toBeAttached({
		timeout: 15000,
	});
}

/** Snapshot of the tab strip: which tabs exist and which is active. */
async function tabSnapshot(page: Page) {
	return page.evaluate(() =>
		Array.from(
			document.querySelectorAll<HTMLElement>('[data-testid="tab"]'),
		).map((tab) => ({
			label: tab.textContent ?? "",
			active: tab.classList.contains("on"),
		})),
	);
}

test("(a) Escape closes the open Base UI menu and no page hotkey runs on it", async ({
	page,
}) => {
	await page.goto("/resources?item=board-eng");
	await hydrated(page);
	await expect(page.getByTestId("tab").first()).toBeVisible();

	// Open the org switcher menu — Base UI renders the popup as role="menu".
	await page.locator("header button.org").click();
	const menu = page.locator('[role="menu"]');
	await expect(menu).toBeVisible();

	const before = await tabSnapshot(page);
	const url = page.url();

	// Exactly one Escape press. The overlay must own it and close …
	await page.keyboard.press("Escape");
	await expect(menu).toHaveCount(0);

	// … and no page-level hotkey may have run on it: same tabs, same active
	// tab, same URL (Mod+T/W/Tab all leave fingerprints here).
	expect(await tabSnapshot(page)).toEqual(before);
	expect(page.url()).toBe(url);
});

test("(c) AppShell hotkeys outside overlays are unchanged", async ({
	page,
}) => {
	await page.goto("/resources?item=board-eng");
	await hydrated(page);
	const tabs = page.getByTestId("tab");
	await expect(tabs.first()).toBeVisible();
	const n0 = await tabs.count();

	// Mod+T opens the inbox tab and makes it active (hotkey-driven, not the
	// header's + button which shell.spec.ts already covers).
	await page.keyboard.press("ControlOrMeta+t");
	await expect(tabs).toHaveCount(n0 + 1);
	await expect(tabs.last()).toHaveClass(/on/);
	await expect(page.locator(".body")).toContainText(/inbox/i);

	// Mod+W closes the active tab — back to the starting strip.
	await page.keyboard.press("ControlOrMeta+w");
	await expect(tabs).toHaveCount(n0);

	// Mod+Tab cycles forward one tab; the active marker follows.
	const activeIndex = async () =>
		(await tabSnapshot(page)).findIndex((t) => t.active);
	const i = await activeIndex();
	await page.keyboard.press("ControlOrMeta+Tab");
	expect(await activeIndex()).toBe((i + 1) % n0);

	// Mod+Shift+Tab cycles back to where we started.
	await page.keyboard.press("ControlOrMeta+Shift+Tab");
	expect(await activeIndex()).toBe(i);
});
