import { useLiveQuery } from "@tanstack/react-db";
import { useGo } from "@/components/shell/nav";
import { Ico } from "@/components/ui/icon";
import { recentCollection } from "@/data/collections";
import { useSidebarSections } from "@/data/queries";
import type { Ref, ViewId } from "@/fixtures/data";

function SidebarRow({
	view,
	item,
	active,
}: {
	view: ViewId;
	item: {
		id: string;
		label: string;
		icon?: string;
		sub?: string;
		count?: number;
		status?: "ok" | "warn" | "err" | "run" | "idle";
		ref?: Ref;
	};
	active: boolean;
}) {
	const go = useGo();
	const two = !!item.sub;
	return (
		<button
			type="button"
			className={`row ${two ? "two" : ""} ${active ? "on" : ""}`}
			data-testid="side-row"
			data-item={item.id}
			onClick={() => {
				if (item.ref) go(item.ref);
				else go({ view, item: item.id });
			}}
		>
			{item.status ? (
				<span className={`st ${item.status}`} />
			) : item.icon ? (
				<Ico n={item.icon} sm />
			) : null}
			<span className="t">
				{item.label}
				{two && <small>{item.sub}</small>}
			</span>
			{item.count ? <span className="n">{item.count}</span> : null}
		</button>
	);
}

function RecentFooter() {
	const recent = useLiveQuery({
		query: (q) =>
			q.from({ item: recentCollection }).orderBy(({ item }) => item.id, "asc"),
	}).data;
	const go = useGo();
	return (
		<div className="recent" data-testid="recent-footer">
			<div className="recent-h">
				<span>Recent</span>
				<span className="kbd">Ctrl E</span>
			</div>
			{(recent ?? []).map((r) => (
				<button
					key={r.id}
					type="button"
					className="row rrow"
					data-testid="recent-row"
					title="Open here. Ctrl+click opens a new tab."
					onClick={() => go(r.ref)}
				>
					<Ico n={r.icon} sm />
					<span className="t">{r.label}</span>
					<span className="when">{r.when}</span>
				</button>
			))}
		</div>
	);
}

export function Sidebar({
	view,
	activeItem,
}: {
	view: ViewId;
	activeItem?: string;
}) {
	const sections = useSidebarSections(view);
	const viewLabel =
		view === "home" ? "Home" : view === "agents" ? "Agents" : "Resources";

	return (
		<aside className="side" aria-label={`${viewLabel} sidebar`}>
			<div className="side-h">
				{viewLabel}
				<span className="acts">
					<button type="button" className="ib" aria-label="New">
						<Ico n="plus" sm />
					</button>
				</span>
			</div>
			<div className="side-scroll">
				{(sections ?? []).map((s) => (
					<div className="grp" key={s.id}>
						{s.label && (
							<div className="grp-h">
								{s.icon && <Ico n={s.icon} sm />}
								<span>{s.label}</span>
								<button
									type="button"
									className="ib add"
									aria-label={`Add to ${s.label}`}
								>
									<Ico n="plus" sm />
								</button>
							</div>
						)}
						{s.items.map((it) => (
							<SidebarRow
								key={`${s.id}-${it.id}`}
								view={view}
								item={it}
								active={activeItem === it.id && !it.ref}
							/>
						))}
					</div>
				))}
			</div>
			<RecentFooter />
		</aside>
	);
}
