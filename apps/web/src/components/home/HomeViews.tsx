import { Button } from "@/components/ui/button";
import { Ico } from "@/components/ui/icon";
import { useBoardTickets, useInbox } from "@/data/queries";
import type { Ticket } from "@/fixtures/data";

export function InboxView() {
	const inbox = useInbox() ?? [];
	return (
		<div className="inbox" data-testid="inbox-view">
			{inbox.map((n) => (
				<div className="it" key={n.id}>
					<span className={`u ${n.unread ? "" : "no"}`} />
					<span className={`mini ${n.agent ? "bot" : ""}`}>
						{n.agent ? <Ico n="bot" sm /> : n.who.slice(0, 2)}
					</span>
					<span className="txt">
						<span className="who">{n.who}</span>{" "}
						<span className="what">{n.what}</span> {n.ref}
					</span>
					<span className="when">{n.when}</span>
				</div>
			))}
		</div>
	);
}

function ListRowLite({ t }: { t: Ticket }) {
	return (
		<div className="lrow" data-key={t.key}>
			<span className="k">{t.key}</span>
			<span className="ti">{t.title}</span>
			<span className="chip">{t.tag}</span>
			<span className="due">
				{t.due
					? new Date(`${t.due}T00:00:00`).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
						})
					: ""}
			</span>
			{!t.who ? (
				<span className="av empty">
					<Ico n="user" sm />
				</span>
			) : (
				<span className={`av ${t.agent ? "bot" : ""}`}>{t.who[0]}</span>
			)}
		</div>
	);
}

function lgroup(head: React.ReactNode, cards: Ticket[]) {
	return (
		<div>
			<div className="lgroup-h">
				{head}
				<span className="n">{cards.length}</span>
			</div>
			{cards.map((t) => (
				<ListRowLite key={t.key} t={t} />
			))}
		</div>
	);
}

export function MyTicketsView({ boardId }: { boardId: string }) {
	const tickets = useBoardTickets(boardId) ?? [];
	const mine = tickets.filter((t) => t.who === "RW");
	const review = tickets.filter((t) => t.status === "review");
	return (
		<div className="list" data-testid="my-tickets-view">
			{lgroup(<span>Assigned to me</span>, mine)}
			{lgroup(
				<>
					<Ico n="git-pull-request" sm />
					<span>Waiting for my review</span>
				</>,
				review,
			)}
		</div>
	);
}

export function HomeToolbar({ activeItem }: { activeItem?: string }) {
	return (
		<div className="toolbar">
			<div className="crumbs">
				<b>Home</b>
			</div>
			<span className="sp" />
			{/* NEVR-505: a labeled fieldset (native group), not `tablist` —
			 * these filter buttons are not tabs (no tab semantics
			 * implemented); a bare tablist with non-tab children misleads
			 * assistive tech. */}
			<fieldset className="seg" aria-label="Inbox filter">
				<button type="button" className="on">
					All
				</button>
				<button type="button">Agents</button>
				<button type="button">People</button>
			</fieldset>
			{activeItem === "mine" && (
				<Button variant="primary" data-testid="my-tickets-cta">
					<Ico n="plus" sm />
					New ticket
				</Button>
			)}
		</div>
	);
}
