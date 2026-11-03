/*
 * Header tabs — local UI state in a TanStack Store (ADR 0014: no zustand).
 * A tab is just a URL; the router owns the current location, the store owns
 * the tab strip. Tab titles/icons are derived from the URL at render time.
 */
import { Store } from "@tanstack/store";

import type { BoardViewId, ViewId } from "@/fixtures/data";

export interface Tab {
	id: number;
	url: string;
}

export interface TabsState {
	tabs: Tab[];
	activeId: number;
}

let nextId = 1;
const tab = (url: string): Tab => ({ id: nextId++, url });

/** Canonical URL for a view/item/board-view target (mockup's `{view, item, bview}`). */
export function targetUrl(
	view: ViewId,
	item?: string,
	bview?: BoardViewId,
): string {
	const params = new URLSearchParams();
	if (item) params.set("item", item);
	if (bview && bview !== "board") params.set("view", bview);
	const qs = params.toString();
	return `/${view}${qs ? `?${qs}` : ""}`;
}

// Seed like the mockup defaults: Engineering board, session, inbox, machine.
const initialTabs = [
	tab(targetUrl("resources", "board-eng", "board")),
	tab(targetUrl("agents", "s-229")),
	tab(targetUrl("home", "inbox")),
	tab(targetUrl("resources", "m-talos")),
];

export const tabsStore = new Store<TabsState>({
	tabs: initialTabs,
	activeId: initialTabs[0].id,
});

export function selectTab(id: number) {
	tabsStore.setState((s) =>
		s.tabs.some((t) => t.id === id) ? { ...s, activeId: id } : s,
	);
}

/** Point the active tab at a new URL (sidebar/rail navigation). */
export function setActiveTabUrl(url: string) {
	tabsStore.setState((s) => ({
		...s,
		tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, url } : t)),
	}));
}

export function openTab(url: string) {
	tabsStore.setState((s) => {
		const t = tab(url);
		return { tabs: [...s.tabs, t], activeId: t.id };
	});
}

export function closeTab(id: number) {
	tabsStore.setState((s) => {
		if (s.tabs.length <= 1) return s;
		const idx = s.tabs.findIndex((t) => t.id === id);
		if (idx === -1) return s;
		const tabs = s.tabs.filter((t) => t.id !== id);
		const activeId =
			s.activeId === id ? tabs[Math.min(idx, tabs.length - 1)].id : s.activeId;
		return { tabs, activeId };
	});
}

export function cycleTab(delta: 1 | -1) {
	tabsStore.setState((s) => {
		const idx = s.tabs.findIndex((t) => t.id === s.activeId);
		const next = (idx + delta + s.tabs.length) % s.tabs.length;
		return { ...s, activeId: s.tabs[next].id };
	});
}

export function selectTabByIndex(oneBased: number) {
	tabsStore.setState((s) => {
		const idx =
			oneBased >= 9 ? s.tabs.length - 1 : Math.min(oneBased, s.tabs.length) - 1;
		return idx >= 0 && idx < s.tabs.length
			? { ...s, activeId: s.tabs[idx].id }
			: s;
	});
}

/**
 * Router → store sync: ensure some tab matches the current location. Called on
 * every location change; keeps direct loads, back/forward and links coherent.
 */
export function syncTabsWithURL(url: string) {
	tabsStore.setState((s) => {
		if (s.tabs.some((t) => t.url === url)) {
			// Prefer the active tab when it already matches.
			const active = s.tabs.find((t) => t.id === s.activeId);
			if (active?.url === url) return s;
			const match = s.tabs.find((t) => t.url === url);
			return match ? { ...s, activeId: match.id } : s;
		}
		const t = tab(url);
		return { tabs: [...s.tabs, t], activeId: t.id };
	});
}
