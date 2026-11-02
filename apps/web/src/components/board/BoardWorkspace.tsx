import { Button } from "@/components/ui/button";
import { Ico } from "@/components/ui/icon";
import {
	useBoard,
	useBoardTickets,
	useBoardViews,
	useStatuses,
} from "@/data/queries";
import type { BoardViewId, Priority, StatusId, Ticket } from "@/fixtures/data";
import { fmtDate, isoOf } from "@/lib/format";
import { PRIORITY_ICONS, PRIORITY_LABELS, STATUS_ICONS } from "@/lib/icons";

/* ---------------- shared ticket atoms (mockup class-for-class) ---------------- */

function Prio({ pri }: { pri: Priority }) {
	return (
		<span className={`prio prio-${pri}`} title={PRIORITY_LABELS[pri]}>
			<Ico n={PRIORITY_ICONS[pri]} sm />
		</span>
	);
}

function Who({ t }: { t: Ticket }) {
	if (!t.who) {
		return (
			<span className="av empty" title="Unassigned">
				<Ico n="user" sm />
			</span>
		);
	}
	return t.agent ? (
		<span className="av bot" title={`${t.who} (agent)`}>
			{t.who[0]}
		</span>
	) : (
		<span className="av" title={t.who}>
			{t.who}
		</span>
	);
}

function Sti({ s }: { s: StatusId }) {
	return (
		<span className={`sti sti-${s}`}>
			<Ico n={STATUS_ICONS[s]} sm />
		</span>
	);
}

function Card({ t }: { t: Ticket }) {
	return (
		<article className={`card ${t.live ? "is-live" : ""}`} data-key={t.key}>
			<div className="c1">
				<span className="k">{t.key}</span>
				<Who t={t} />
			</div>
			<span className="ti">{t.title}</span>
			<div className="f">
				<Prio pri={t.pri} />
				<span className="chip">{t.tag}</span>
				{t.live ? (
					<span className="live">
						<span className="st run" />
						{t.live}
					</span>
				) : t.due ? (
					<span className="due">{fmtDate(t.due)}</span>
				) : null}
			</div>
			{t.live && <span className="runbar" />}
		</article>
	);
}

function byDue(a: Ticket, b: Ticket) {
	return (a.due ?? "9999").localeCompare(b.due ?? "9999");
}

function ListGroup({
	head,
	cards,
}: {
	head: React.ReactNode;
	cards: Ticket[];
}) {
	return (
		<div className="lgroup">
			<div className="lgroup-h">
				<Ico n="chevron-down" sm />
				{head}
				<span className="n">{cards.length}</span>
				<button type="button" className="ib" aria-label="Add ticket">
					<Ico n="plus" sm />
				</button>
			</div>
			{[...cards].sort(byDue).map((t) => (
				<div className="lrow" data-key={t.key} key={t.key}>
					<Prio pri={t.pri} />
					<span className="k">{t.key}</span>
					<Sti s={t.status} />
					<span className="ti">{t.title}</span>
					{t.live ? (
						<span className="live">
							<span className="st run" />
							{t.who}, {t.live}
						</span>
					) : null}
					<span className="chip">{t.tag}</span>
					<span className="due">{t.due ? fmtDate(t.due) : ""}</span>
					<Who t={t} />
				</div>
			))}
		</div>
	);
}

/* ---------------- view projections ---------------- */

function BoardBoard({
	tickets,
	statuses,
}: {
	tickets: Ticket[];
	statuses: { id: StatusId; label: string }[];
}) {
	const active = tickets.filter((t) => t.status !== "backlog");
	return (
		<div className="board" data-testid="board-body">
			{statuses
				.filter((s) => s.id !== "backlog")
				.map((s) => {
					const cs = active.filter((t) => t.status === s.id);
					return (
						<section key={s.id}>
							<div className="col-h">
								<Sti s={s.id} />
								<span>{s.label}</span>
								<span className="n">{cs.length}</span>
								<button type="button" className="ib" aria-label="Add ticket">
									<Ico n="plus" sm />
								</button>
							</div>
							{cs.map((t) => (
								<Card key={t.key} t={t} />
							))}
						</section>
					);
				})}
		</div>
	);
}

function BoardList({
	tickets,
	statuses,
}: {
	tickets: Ticket[];
	statuses: { id: StatusId; label: string }[];
}) {
	const active = tickets.filter((t) => t.status !== "backlog");
	return (
		<div className="list" data-testid="list-body">
			<div className="lhead">
				<span />
				<span>ID</span>
				<span />
				<span>Title</span>
				<span>Label</span>
				<span>Due</span>
				<span />
			</div>
			{statuses
				.filter((s) => s.id !== "backlog")
				.map((s) => (
					<ListGroup
						key={s.id}
						head={
							<>
								<Sti s={s.id} />
								<span>{s.label}</span>
							</>
						}
						cards={active.filter((t) => t.status === s.id)}
					/>
				))}
		</div>
	);
}

function BoardBacklog({ tickets }: { tickets: Ticket[] }) {
	const b = tickets.filter((t) => t.status === "backlog");
	const order: Priority[] = ["urgent", "high", "medium", "low", "none"];
	return (
		<div className="list backlog" data-testid="backlog-body">
			<div className="bl-note">
				<Ico n="archive" sm />
				<span>
					{b.length} tickets not scheduled. Move one to To do to start it, or
					let an agent triage the list.
				</span>
				<span className="sp" />
				<Button size="sm">
					<Ico n="bot" sm />
					Triage with agent
				</Button>
			</div>
			{order.map((p) => {
				const cs = b.filter((t) => t.pri === p);
				return cs.length ? (
					<ListGroup
						key={p}
						head={
							<>
								<Prio pri={p} />
								<span>{PRIORITY_LABELS[p]}</span>
							</>
						}
						cards={cs}
					/>
				) : null;
			})}
		</div>
	);
}

/** Timeline: today = Mon Nov 2 2026, one column per day, 35 days. */
function BoardTimeline({ tickets }: { tickets: Ticket[] }) {
	const start = new Date("2026-10-19T00:00:00");
	const days = 35;
	const today = 14;
	const dayIdx = (d: string) =>
		Math.round(
			(new Date(`${d}T00:00:00`).getTime() - start.getTime()) / 86400000,
		);
	const day = (i: number) => new Date(start.getTime() + i * 86400000);
	const wk = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
	// Rows without both dates cannot render on the timeline.
	const rows: (Ticket & { start: string; due: string })[] = tickets.flatMap(
		(t) =>
			t.status !== "backlog" && t.start && t.due
				? [{ ...t, start: t.start, due: t.due }]
				: [],
	);

	const monthLabel = (i: number) =>
		day(i).getDate() === 1
			? day(i).toLocaleDateString("en-US", { month: "long" })
			: null;
	// Static 35-day grid: the date itself is the element identity.
	const dayKey = (i: number) => day(i).toISOString().slice(0, 10);

	return (
		<div
			className="timeline"
			style={{ "--days": days } as React.CSSProperties}
			data-testid="timeline-body"
		>
			<div className="tl-side">
				<div className="tl-sh">
					<span>{rows.length} tickets with dates</span>
				</div>
				{rows.map((t) => (
					<div className="tl-name" key={t.key}>
						<Sti s={t.status} />
						<span className="k">{t.key}</span>
						<span className="t">{t.title}</span>
					</div>
				))}
			</div>
			<div className="tl-grid">
				<div className="tl-head">
					{Array.from({ length: days }, (_, i) => {
						const d = day(i);
						return (
							<div
								key={dayKey(i)}
								className={`tl-d ${wk(d) ? "wk" : ""} ${i === today ? "today" : ""}`}
							>
								<small>{"SMTWTFS"[d.getDay()]}</small>
								<span>{d.getDate()}</span>
							</div>
						);
					})}
					{Array.from({ length: days }, (_, i) => {
						const label = monthLabel(i);
						return label ? (
							<span
								key={`mlabel-${dayKey(i)}`}
								className="tl-mlabel"
								style={{ "--i": i } as React.CSSProperties}
							>
								{label}
							</span>
						) : null;
					})}
				</div>
				<div
					className="tl-body"
					style={
						{ "--rows": rows.length, "--days": days } as React.CSSProperties
					}
				>
					{Array.from({ length: days }, (_, i) =>
						wk(day(i)) ? (
							<div
								key={`wk-${dayKey(i)}`}
								className="tl-wk"
								style={{ "--i": i } as React.CSSProperties}
							/>
						) : null,
					)}
					{Array.from({ length: days }, (_, i) =>
						day(i).getDate() === 1 ? (
							<div
								key={`mline-${dayKey(i)}`}
								className="tl-month"
								style={{ "--i": i } as React.CSSProperties}
							/>
						) : null,
					)}
					<div
						className="tl-today"
						style={{ "--i": today } as React.CSSProperties}
					/>
					{rows.map((t, r) => {
						const a = dayIdx(t.start);
						const b = dayIdx(t.due);
						const a2 = Math.max(a, 0);
						return (
							<div
								key={t.key}
								className={`tl-bar ${t.live ? "is-live" : ""} ${a < 0 ? "cut" : ""}`}
								style={
									{ "--r": r, "--a": a2, "--b": b + 1 } as React.CSSProperties
								}
							>
								<Sti s={t.status} />
								<span className="bt">
									{t.live
										? `${t.who}, ${t.live}`
										: `${fmtDate(t.start)} to ${fmtDate(t.due)}`}
								</span>
								<Who t={t} />
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/** Calendar: October 26 – December 6 2026 (42 cells), mockup-faithful. */
function BoardCalendar({ tickets }: { tickets: Ticket[] }) {
	const start = new Date("2026-10-26T00:00:00");
	const today = "2026-11-02";
	const cells = Array.from(
		{ length: 42 },
		(_, i) => new Date(start.getTime() + i * 86400000),
	);
	const dueMap = new Map<string, Ticket[]>();
	for (const t of tickets) {
		if (!t.due) continue;
		dueMap.set(t.due, [...(dueMap.get(t.due) ?? []), t]);
	}
	return (
		<div className="cal" data-testid="calendar-body">
			<div className="cal-top">
				<b>November 2026</b>
				<span className="sp" />
				<button type="button" className="ib" aria-label="Previous month">
					<Ico n="chevron-right" sm flip />
				</button>
				<Button size="sm">Today</Button>
				<button type="button" className="ib" aria-label="Next month">
					<Ico n="chevron-right" sm />
				</button>
			</div>
			<div className="cal-grid">
				{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
					<div className="cal-dow" key={d}>
						{d}
					</div>
				))}
				{cells.map((d) => {
					const iso = isoOf(d);
					const due = dueMap.get(iso) ?? [];
					const out = d.getMonth() !== 10;
					return (
						<div
							key={iso}
							className={`cal-c ${out ? "out" : ""} ${iso === today ? "today" : ""}`}
						>
							<span className="cal-n">{d.getDate()}</span>
							{due.map((t) => (
								<div
									key={t.key}
									className={`cal-ev ${t.live ? "is-live" : ""}`}
									title={t.key}
								>
									<Sti s={t.status} />
									<span className="t">{t.title}</span>
								</div>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function BoardAgentWork({ tickets }: { tickets: Ticket[] }) {
	const agents = [
		...new Set(tickets.filter((t) => t.agent).map((t) => t.who)),
	].filter((a): a is string => !!a);
	return (
		<div className="board" data-testid="agentwork-body">
			{agents.map((a) => {
				const cs = tickets.filter((t) => t.agent && t.who === a);
				return (
					<section key={a}>
						<div className="col-h">
							<span className="av bot">
								<Ico n="bot" />
							</span>
							<span>{a}</span>
							<span className="n">{cs.length}</span>
						</div>
						{cs.map((t) => (
							<Card key={t.key} t={t} />
						))}
					</section>
				);
			})}
			<section>
				<div className="col-h">
					<span className="av bot">
						<Ico n="bot" />
					</span>
					<span>Scout</span>
					<span className="n">0</span>
				</div>
				<div className="empty-col">
					No tickets assigned. Scout files its own reports.
				</div>
			</section>
		</div>
	);
}

function BoardMine({ tickets }: { tickets: Ticket[] }) {
	const mine = tickets.filter((t) => t.who === "RW");
	return (
		<div className="list" data-testid="mine-body">
			<ListGroup head={<span>Due this week</span>} cards={mine} />
		</div>
	);
}

/* ---------------- workspace: crumbs + toolbar + viewbar + body ---------------- */

const FILTER_CHIPS: Partial<Record<BoardViewId, [string, string][]>> = {
	agentwork: [["bot", "Assignee is any agent"]],
	mine: [
		["user", "Assignee is me"],
		["calendar", "Due within 7 days"],
	],
};

export function BoardWorkspace({
	boardId,
	bview,
}: {
	boardId: string;
	bview: BoardViewId;
}) {
	const board = useBoard(boardId)?.[0];
	const tickets = useBoardTickets(boardId) ?? [];
	const statuses = useStatuses() ?? [];
	const boardViews = useBoardViews() ?? [];

	const defaults = boardViews.filter((v) => !v.custom);
	const customs = boardViews.filter((v) => v.custom);
	const current = boardViews.find((v) => v.id === bview);
	const chips = FILTER_CHIPS[bview] ?? [];

	const body = () => {
		switch (bview) {
			case "board":
				return <BoardBoard tickets={tickets} statuses={statuses} />;
			case "list":
				return <BoardList tickets={tickets} statuses={statuses} />;
			case "timeline":
				return <BoardTimeline tickets={tickets} />;
			case "backlog":
				return <BoardBacklog tickets={tickets} />;
			case "calendar":
				return <BoardCalendar tickets={tickets} />;
			case "agentwork":
				return <BoardAgentWork tickets={tickets} />;
			case "mine":
				return <BoardMine tickets={tickets} />;
		}
	};

	return (
		<main className="work board-work">
			<div className="toolbar">
				<div className="crumbs">
					<span>Boards</span>
					<Ico n="chevron-right" sm />
					<b>{board?.label ?? boardId}</b>
					<button type="button" className="ib star" aria-label="Favorite">
						<Ico n="star" sm />
					</button>
				</div>
				<span className="sp" />
				<Button variant="primary">
					<Ico n="plus" sm />
					New ticket
				</Button>
			</div>
			<div className="viewbar">
				<div className="vtabs" role="tablist" aria-label="Board views">
					{defaults.map((v) => (
						<button
							key={v.id}
							type="button"
							className={`vtab ${v.id === bview ? "on" : ""}`}
							role="tab"
							aria-selected={v.id === bview}
							data-testid={`bview-${v.id}`}
						>
							<Ico n={v.icon} sm />
							<span>{v.label}</span>
						</button>
					))}
					<span className="vsep" />
					{customs.map((v) => (
						<button
							key={v.id}
							type="button"
							className={`vtab ${v.id === bview ? "on" : ""}`}
							role="tab"
							aria-selected={v.id === bview}
							data-testid={`bview-${v.id}`}
							title={v.desc}
						>
							<Ico n={v.icon} sm />
							<span>{v.label}</span>
						</button>
					))}
					<button
						type="button"
						className="vtab add"
						title="Save the current filters as a view"
					>
						<Ico n="plus" sm />
						<span>View</span>
					</button>
				</div>
				<span className="sp" />
				<div className="filterbar">
					{chips.map(([icon, label]) => (
						<span className="fchip" key={label}>
							<Ico n={icon} sm />
							<span>{label}</span>
							<button type="button" className="x" aria-label="Remove filter">
								<Ico n="x" sm />
							</button>
						</span>
					))}
					<Button variant="ghost" size="sm">
						<Ico n="filter" sm />
						Filter
					</Button>
					<Button variant="ghost" size="sm">
						<Ico n="sliders-horizontal" sm />
						Display
					</Button>
				</div>
			</div>
			<div className="vp">
				{current ? (
					body()
				) : (
					<div className="pad">
						<h1 className="pg">{board?.label ?? boardId}</h1>
						<p className="sub">Unknown board view.</p>
					</div>
				)}
			</div>
		</main>
	);
}
