import { useLiveQuery } from "@tanstack/react-db";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Header } from "@/components/shell/Header";
import { useGo } from "@/components/shell/nav";
import { Rail } from "@/components/shell/Rail";
import { Sidebar } from "@/components/shell/Sidebar";
import { parseUrl, Tabs } from "@/components/shell/Tabs";
import { ThemeSync } from "@/components/shell/ThemeSync";
import { Ico } from "@/components/ui/icon";
import { boardsCollection } from "@/data/collections";
import type { ViewId } from "@/fixtures/data";
import {
	closeTab,
	cycleTab,
	openTab,
	syncTabsWithURL,
	tabsStore,
} from "@/state/tabs";

export function AppShell({ children }: { children: React.ReactNode }) {
	const location = useRouterState({ select: (s) => s.location });
	const go = useGo();
	const path = location.pathname.replace(/^\//, "") as ViewId;
	const activeView: ViewId =
		path === "resources" || path === "agents" ? path : "home";
	const activeItem = (location.search as { item?: string }).item;

	// Router → tabs: keep the strip coherent with the current location.
	useEffect(() => {
		syncTabsWithURL(location.href);
	}, [location.href]);

	// Tab → router: follow the active tab when the store changes (tab click,
	// Ctrl+T/W, close). store.subscribe keeps this off the render path.
	useEffect(() => {
		const subscription = tabsStore.subscribe(() => {
			const { tabs, activeId } = tabsStore.state;
			const active = tabs.find((t) => t.id === activeId);
			if (active && active.url !== location.href) go(parseUrl(active.url));
		});
		return () => subscription.unsubscribe();
	}, [location.href, go]);

	// Tab shortcuts (mockup keyboard model), via TanStack Hotkeys.
	useHotkeys([
		{ hotkey: "Mod+T", callback: () => openTab("/?item=inbox") },
		{ hotkey: "Mod+W", callback: () => closeTab(tabsStore.state.activeId) },
		{ hotkey: "Mod+Tab", callback: () => cycleTab(1) },
		{ hotkey: "Mod+Shift+Tab", callback: () => cycleTab(-1) },
	]);

	return (
		<div id="app">
			<ThemeSync />
			<Header tabs={<Tabs />} />
			<div className="body">
				<Rail activeView={activeView} />
				<Sidebar view={activeView} activeItem={activeItem} />
				{children}
			</div>
		</div>
	);
}

/** Fallback pad for items not designed in this pass (mirrors the mockup). */
export function PadPage({
	title,
	section,
}: {
	title: string;
	section?: string | null;
}) {
	return (
		<main className="work">
			<div className="toolbar">
				<div className="crumbs">
					{section && (
						<>
							<span>{section}</span>
							<Ico n="chevron-right" sm />
						</>
					)}
					<b>{title}</b>
				</div>
				<span className="sp" />
			</div>
			<div className="vp">
				<div className="pad">
					<h1 className="pg">{title}</h1>
					<p className="sub">
						{section ?? ""} overview. Not designed in this pass.
					</p>
				</div>
			</div>
		</main>
	);
}

/** Engineering is the canonical demo board in the fixtures. */
export function useFirstBoardId(): string | undefined {
	return useLiveQuery({
		query: (q) => q.from({ board: boardsCollection }),
	}).data?.[0]?.id;
}
