import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useLayoutEffect, useRef, useState } from "react";
import { ROUTE_OF } from "@/components/shell/nav";
import { Ico } from "@/components/ui/icon";
import { boardViewsCollection, sectionsCollection } from "@/data/collections";
import type { BoardViewId, ViewId } from "@/fixtures/data";
import { closeTab, openTab, selectTab, tabsStore } from "@/state/tabs";

export interface Target {
	view: ViewId;
	item?: string;
	bview: BoardViewId;
}

export function parseUrl(url: string): Target {
	const [path, qs] = url.split("?");
	const params = new URLSearchParams(qs);
	const view = (path.replace(/^\//, "") || "home") as ViewId;
	return {
		view,
		item: params.get("item") ?? undefined,
		bview: (params.get("view") as BoardViewId | null) ?? "board",
	};
}

/** Derive the tab label exactly like the mockup's tabTitle/tabIcon. */
function useTabMeta() {
	const sections = useLiveQuery({
		query: (q) => q.from({ section: sectionsCollection }),
	}).data;
	const boardViews = useLiveQuery({
		query: (q) => q.from({ view: boardViewsCollection }),
	}).data;

	const findItem = (view: ViewId, id?: string) => {
		if (!id || !sections) return null;
		for (const s of sections) {
			if (s.view !== view) continue;
			for (const it of s.items) if (it.id === id) return { sec: s, it };
		}
		return null;
	};

	return (t: Target) => {
		const f = findItem(t.view, t.item);
		const isBoard = t.view === "resources" && f?.sec.id === "r-boards";
		const base =
			f?.it.label ??
			(t.view === "home"
				? "Home"
				: t.view === "agents"
					? "Agents"
					: "Resources");
		const bv = boardViews?.find((v) => v.id === t.bview);
		const title =
			isBoard && t.bview !== "board"
				? `${base}, ${bv?.label ?? "Board"}`
				: base;
		const icon = isBoard
			? (bv?.icon ?? "kanban-square")
			: (f?.it.icon ??
				f?.sec.icon ??
				(t.view === "home" ? "inbox" : t.view === "agents" ? "bot" : "layers"));
		return { title, icon };
	};
}

/** Tabs shrink to 88px, then the track clips with an overflow count (mockup fitTabs). */
function useTabOverflow() {
	const trackRef = useRef<HTMLUListElement>(null);
	const [hidden, setHidden] = useState(0);

	useLayoutEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const measure = () => {
			const base = track.getBoundingClientRect().left - track.scrollLeft;
			const pos = (el: Element) => {
				const b = el.getBoundingClientRect();
				return { l: b.left - base, r: b.right - base };
			};
			const act = track.querySelector(".tab.on");
			if (act) {
				const p = pos(act);
				if (p.r > track.scrollLeft + track.clientWidth) {
					track.scrollLeft = p.r - track.clientWidth;
				}
				if (p.l < track.scrollLeft) track.scrollLeft = p.l;
			}
			const count = Array.from(track.children).filter((el) => {
				const p = pos(el);
				return (
					p.r > track.scrollLeft + track.clientWidth + 1 ||
					p.l < track.scrollLeft - 1
				);
			}).length;
			setHidden(count);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(track);
		for (const child of track.children) ro.observe(child);
		return () => ro.disconnect();
	});

	return { trackRef, hidden };
}

export function Tabs() {
	const navigate = useNavigate();
	const { tabs, activeId } = useStore(tabsStore);
	const metaOf = useTabMeta();
	const { trackRef, hidden } = useTabOverflow();

	const go = (url: string) => {
		const t = parseUrl(url);
		const search: { item?: string; view?: BoardViewId } = {};
		if (t.item) search.item = t.item;
		if (t.bview !== "board") search.view = t.bview;
		navigate({ to: ROUTE_OF[t.view], search });
	};

	return (
		<nav className="tabs" aria-label="Open tabs">
			{/* NEVR-505: the strip is navigation, not an ARIA tabs widget — a
			 * tab's children are presentational by spec, so a close control
			 * can never live inside one. Each tab is a listitem holding the
			 * activate button and its close button as siblings. */}
			<ul className="tabs-track" ref={trackRef}>
				{tabs.map((tab, i) => {
					const target = parseUrl(tab.url);
					const { title, icon } = metaOf(target);
					const activate = () => {
						selectTab(tab.id);
						go(tab.url);
					};
					return (
						<li
							key={tab.id}
							className={`tab ${tab.id === activeId ? "on" : ""}`}
							data-testid="tab"
							title={title}
						>
							<button
								type="button"
								className="tab-btn"
								aria-current={tab.id === activeId ? "page" : undefined}
								onClick={activate}
							>
								<Ico n={icon} sm />
								<span className="t">{title}</span>
							</button>
							<button
								type="button"
								className="x"
								data-testid="tab-close"
								aria-label={`Close tab ${i + 1}`}
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
									const state = tabsStore.state;
									const nextActive = state.tabs.find(
										(t) => t.id === state.activeId,
									);
									if (nextActive) go(nextActive.url);
								}}
							>
								<Ico n="x" sm />
							</button>
						</li>
					);
				})}
			</ul>
			<button
				type="button"
				className={`tabs-more ${hidden > 0 ? "show" : ""}`}
				data-testid="tabs-more"
				title="All tabs"
				onClick={() => {
					const track = trackRef.current;
					if (!track) return;
					track.scrollLeft =
						track.scrollLeft + track.clientWidth >= track.scrollWidth - 2
							? 0
							: track.scrollWidth;
				}}
			>
				<Ico n="chevron-down" sm />
				<span>{hidden > 0 ? hidden : ""}</span>
			</button>
			<button
				type="button"
				className="newtab"
				data-testid="newtab"
				aria-label="New tab"
				title="New tab (Ctrl+T)"
				onClick={() => {
					// Canonical home URL so the router-sync below doesn't add a second tab.
					openTab("/?item=inbox");
					go("/?item=inbox");
				}}
			>
				<Ico n="plus" />
			</button>
		</nav>
	);
}
