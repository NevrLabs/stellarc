/*
 * Static fixtures ported from docs/design/shell/data.js (2026-11-02 mockup).
 * NEVR-434 swaps apps/web/src/data/collections.ts from localOnly fixtures to
 * real TanStack DB collections; these shapes are the contract.
 */

export type ViewId = "home" | "resources" | "agents";
export type StatusId = "backlog" | "todo" | "progress" | "review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type BoardViewId =
	| "board"
	| "list"
	| "timeline"
	| "backlog"
	| "calendar"
	| "agentwork"
	| "mine";

export interface Org {
	id: string;
	name: string;
	initials: string;
}

export interface Ref {
	view: ViewId;
	item: string;
	bview?: BoardViewId;
}

export interface SidebarItem {
	id: string;
	label: string;
	icon?: string;
	sub?: string;
	count?: number;
	status?: "ok" | "warn" | "err" | "run" | "idle";
	ref?: Ref;
}

export interface SidebarSection {
	id: string;
	view: ViewId;
	label: string | null;
	icon?: string;
	order: number;
	items: SidebarItem[];
}

export interface RecentItem {
	id: string;
	label: string;
	kind: string;
	icon: string;
	when: string;
	ref: Ref;
}

export interface InboxItem {
	id: string;
	who: string;
	agent: boolean;
	what: string;
	ref: string;
	when: string;
	unread: boolean;
}

export interface Ticket {
	key: string;
	title: string;
	status: StatusId;
	pri: Priority;
	who: string | null;
	agent: boolean;
	live?: string;
	tag: string;
	start?: string;
	due?: string;
	boardId: string;
}

export interface Status {
	id: StatusId;
	label: string;
	order: number;
}

export interface Board {
	id: string;
	label: string;
	count: number;
}

export interface BoardView {
	id: BoardViewId;
	label: string;
	icon: string;
	custom: boolean;
	desc?: string;
}

export interface ViewMeta {
	id: ViewId;
	label: string;
	icon: string;
	flagged?: boolean;
}

const data = {
	orgs: [
		{ id: "nevr", name: "Nevr Labs", initials: "NL" },
		{ id: "noov", name: "Noovoleum", initials: "NV" },
	] as Org[],

	me: { name: "Raisal W", initials: "RW", email: "raisal@nevrlabs.dev" },

	views: [
		{ id: "home", label: "Home", icon: "inbox" },
		{ id: "resources", label: "Resources", icon: "layers" },
		{ id: "agents", label: "Agents", icon: "bot", flagged: true },
	] as ViewMeta[],

	recent: [
		{
			id: "r1",
			label: "Preserve partial transcript",
			kind: "session",
			icon: "message-square-text",
			when: "now",
			ref: { view: "agents", item: "s-229" },
		},
		{
			id: "r2",
			label: "Engineering, timeline",
			kind: "board",
			icon: "kanban-square",
			when: "4m",
			ref: { view: "resources", item: "board-eng", bview: "timeline" },
		},
		{
			id: "r3",
			label: "talos-tower",
			kind: "machine",
			icon: "server",
			when: "12m",
			ref: { view: "resources", item: "m-talos" },
		},
		{
			id: "r4",
			label: "Deps to latest",
			kind: "session",
			icon: "message-square-text",
			when: "1h",
			ref: { view: "agents", item: "s-419" },
		},
		{
			id: "r5",
			label: "Design",
			kind: "board",
			icon: "kanban-square",
			when: "3h",
			ref: { view: "resources", item: "board-design" },
		},
	] as RecentItem[],

	inbox: [
		{
			id: "i1",
			who: "Stellarc Reviewer",
			agent: true,
			what: "requested changes on",
			ref: "NEVR-12 Agents directory",
			when: "12m",
			unread: true,
		},
		{
			id: "i2",
			who: "Stellarc Builder",
			agent: true,
			what: "opened PR #163 for",
			ref: "NEVR-229 Runner hardening",
			when: "40m",
			unread: true,
		},
		{
			id: "i3",
			who: "Talos",
			agent: true,
			what: "triaged scout report",
			ref: "Competitors 2026-11-01",
			when: "2h",
			unread: true,
		},
		{
			id: "i4",
			who: "Faris",
			agent: false,
			what: "commented on",
			ref: "NEVR-150 a11y floor",
			when: "yesterday",
			unread: false,
		},
		{
			id: "i5",
			who: "Stellarc Scout",
			agent: true,
			what: "filed",
			ref: "Libraries 2026-11-01",
			when: "yesterday",
			unread: false,
		},
	] as InboxItem[],

	boards: [
		{ id: "board-eng", label: "Engineering", count: 10 },
		{ id: "board-design", label: "Design", count: 5 },
		{ id: "board-triage", label: "Triage", count: 9 },
	] as Board[],

	statuses: [
		{ id: "backlog", label: "Backlog", order: 0 },
		{ id: "todo", label: "To do", order: 1 },
		{ id: "progress", label: "In progress", order: 2 },
		{ id: "review", label: "In review", order: 3 },
		{ id: "done", label: "Done", order: 4 },
	] as Status[],

	boardViews: [
		{ id: "board", label: "Board", icon: "kanban-square", custom: false },
		{ id: "list", label: "List", icon: "list", custom: false },
		{ id: "timeline", label: "Timeline", icon: "gantt", custom: false },
		{ id: "backlog", label: "Backlog", icon: "archive", custom: false },
		{ id: "calendar", label: "Calendar", icon: "calendar", custom: false },
		{
			id: "agentwork",
			label: "Agent work",
			icon: "bot",
			custom: true,
			desc: "Assigned to an agent, grouped by agent",
		},
		{
			id: "mine",
			label: "Mine this week",
			icon: "user",
			custom: true,
			desc: "Assigned to me, due within 7 days",
		},
	] as BoardView[],

	tickets: [
		{
			key: "NEVR-421",
			title: "Merge dev into effect/v4 and port agent features",
			status: "progress",
			pri: "urgent",
			who: "Builder",
			agent: true,
			live: "6m, step 2",
			tag: "Effect",
			start: "2026-11-02",
			due: "2026-11-06",
			boardId: "board-eng",
		},
		{
			key: "NEVR-229",
			title: "Preserve partial transcript on interrupt",
			status: "progress",
			pri: "high",
			who: "Builder",
			agent: true,
			live: "18m, step 6",
			tag: "Runner",
			start: "2026-10-30",
			due: "2026-11-04",
			boardId: "board-eng",
		},
		{
			key: "NEVR-223",
			title: "Agent transcript surface on shadcn AI elements",
			status: "review",
			pri: "high",
			who: "Reviewer",
			agent: true,
			tag: "UI",
			start: "2026-10-27",
			due: "2026-11-03",
			boardId: "board-eng",
		},
		{
			key: "NEVR-179",
			title: "Agent memory from event-log artifacts",
			status: "review",
			pri: "medium",
			who: "Reviewer",
			agent: true,
			tag: "Agents",
			start: "2026-10-26",
			due: "2026-11-05",
			boardId: "board-eng",
		},
		{
			key: "NEVR-430",
			title: "Shell: views rail, tabs and recent footer",
			status: "todo",
			pri: "high",
			who: "RW",
			agent: false,
			tag: "UI",
			start: "2026-11-03",
			due: "2026-11-13",
			boardId: "board-eng",
		},
		{
			key: "NEVR-150",
			title: "A11y floor in the Playwright viewport suite",
			status: "todo",
			pri: "medium",
			who: "FA",
			agent: false,
			tag: "UI",
			start: "2026-11-05",
			due: "2026-11-12",
			boardId: "board-design",
		},
		{
			key: "NEVR-55",
			title: "React Compiler, MCP and editor updates",
			status: "todo",
			pri: "medium",
			who: null,
			agent: false,
			tag: "Deps",
			start: "2026-11-09",
			due: "2026-11-18",
			boardId: "board-eng",
		},
		{
			key: "NEVR-72",
			title: "Tauri 2.12 verification pass",
			status: "todo",
			pri: "low",
			who: "RW",
			agent: false,
			tag: "Desktop",
			start: "2026-11-10",
			due: "2026-11-13",
			boardId: "board-eng",
		},
		{
			key: "NEVR-415",
			title: "Attempt continuity across retries",
			status: "done",
			pri: "high",
			who: "FA",
			agent: false,
			tag: "Agents",
			start: "2026-10-20",
			due: "2026-10-30",
			boardId: "board-eng",
		},
		{
			key: "NEVR-243",
			title: "Per-attempt usage on the task API",
			status: "done",
			pri: "medium",
			who: "FA",
			agent: false,
			tag: "Agents",
			start: "2026-10-22",
			due: "2026-10-29",
			boardId: "board-eng",
		},
		{
			key: "NEVR-196",
			title: "Org-level spend caps for agent runs",
			status: "backlog",
			pri: "urgent",
			who: null,
			agent: false,
			tag: "Agents",
			boardId: "board-eng",
		},
		{
			key: "NEVR-190",
			title: "Expo build of the mobile shell",
			status: "backlog",
			pri: "high",
			who: null,
			agent: false,
			tag: "Mobile",
			boardId: "board-eng",
		},
		{
			key: "NEVR-180",
			title: "Squads: group agents and route by skill",
			status: "backlog",
			pri: "medium",
			who: null,
			agent: false,
			tag: "Agents",
			boardId: "board-eng",
		},
		{
			key: "NEVR-181",
			title: "Autopilot schedules per project",
			status: "backlog",
			pri: "low",
			who: null,
			agent: false,
			tag: "Agents",
			boardId: "board-eng",
		},
		{
			key: "NEVR-205",
			title: "Calendar sync for due dates",
			status: "backlog",
			pri: "low",
			who: null,
			agent: false,
			tag: "Integrations",
			boardId: "board-design",
		},
		{
			key: "NEVR-201",
			title: "Import boards from Linear",
			status: "backlog",
			pri: "none",
			who: null,
			agent: false,
			tag: "Integrations",
			boardId: "board-triage",
		},
	] as Ticket[],

	sections: [
		// Home
		{
			id: "h-main",
			view: "home",
			label: null,
			order: 0,
			items: [
				{ id: "inbox", label: "Inbox", icon: "inbox", count: 3 },
				{ id: "mine", label: "My tickets", icon: "circle-dot", count: 12 },
			],
		},
		{
			id: "h-favs",
			view: "home",
			label: "Favorites",
			order: 1,
			items: [
				{
					id: "fav-agentwork",
					label: "Agent work",
					icon: "bot",
					ref: { view: "resources", item: "board-eng", bview: "agentwork" },
				},
				{
					id: "fav-v4",
					label: "Effect v4 port",
					icon: "folder-kanban",
					ref: { view: "resources", item: "p-effect" },
				},
			],
		},
		// Resources
		{
			id: "r-boards",
			view: "resources",
			label: "Boards",
			icon: "kanban-square",
			order: 0,
			items: [
				{ id: "board-eng", label: "Engineering", count: 10 },
				{ id: "board-design", label: "Design", count: 5 },
				{ id: "board-triage", label: "Triage", count: 9 },
			],
		},
		{
			id: "r-projects",
			view: "resources",
			label: "Projects",
			icon: "folder-kanban",
			order: 1,
			items: [
				{ id: "p-v2", label: "Stellarc v2" },
				{ id: "p-effect", label: "Effect v4 port" },
				{ id: "p-desktop", label: "Desktop + mobile" },
			],
		},
		{
			id: "r-repos",
			view: "resources",
			label: "Repos",
			icon: "git-branch",
			order: 2,
			items: [{ id: "r-stellarc", label: "NevrLabs/stellarc" }],
		},
		{
			id: "r-machines",
			view: "resources",
			label: "Machines",
			icon: "server",
			order: 3,
			items: [
				{ id: "m-talos", label: "talos-tower", status: "ok" },
				{ id: "m-zephyr", label: "zephyr-m16", status: "ok" },
				{ id: "m-farm", label: "build-farm-01", status: "warn" },
			],
		},
		{
			id: "r-agents",
			view: "resources",
			label: "Agents",
			icon: "bot",
			order: 4,
			items: [
				{ id: "a-builder", label: "Builder", status: "run" },
				{ id: "a-reviewer", label: "Reviewer", status: "idle" },
				{ id: "a-scout", label: "Scout", status: "idle" },
			],
		},
		// Agents (behind the agents flag)
		{
			id: "a-live",
			view: "agents",
			label: "Live sessions",
			order: 1,
			items: [
				{
					id: "s-229",
					label: "Preserve partial transcript",
					sub: "Builder on NEVR-229",
					status: "run",
				},
				{
					id: "s-421",
					label: "Port agent features to v4",
					sub: "Builder on NEVR-421",
					status: "run",
				},
			],
		},
		{
			id: "a-recent",
			view: "agents",
			label: "Recent sessions",
			order: 2,
			items: [
				{
					id: "s-419",
					label: "Deps to latest",
					sub: "Builder, 41m",
					status: "ok",
				},
				{
					id: "s-scout",
					label: "Competitor radar",
					sub: "Scout, 22m",
					status: "ok",
				},
				{
					id: "s-12",
					label: "Agents directory review",
					sub: "Reviewer, failed",
					status: "err",
				},
			],
		},
		{
			id: "a-bots",
			view: "agents",
			label: "Agents and bots",
			order: 3,
			items: [
				{
					id: "a-builder",
					label: "Builder",
					sub: "hermes, glm-5.3",
					status: "run",
				},
				{
					id: "a-reviewer",
					label: "Reviewer",
					sub: "hermes, deepseek-v4",
					status: "idle",
				},
				{
					id: "a-scout",
					label: "Scout",
					sub: "hermes, glm-5.3",
					status: "idle",
				},
				{ id: "a-talos", label: "Talos", sub: "hermes, opus", status: "idle" },
			],
		},
	] as SidebarSection[],
};

export const fixtures = data;
export const me = data.me;
