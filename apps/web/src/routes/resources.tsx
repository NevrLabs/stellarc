import { createFileRoute } from "@tanstack/react-router";

import { BoardWorkspace } from "@/components/board/BoardWorkspace";
import { AppShell, PadPage } from "@/components/shell/AppShell";
import type { BoardViewId } from "@/fixtures/data";

interface ResourcesSearch {
	item?: string;
	view?: BoardViewId;
}

export const Route = createFileRoute("/resources")({
	validateSearch: (search: Record<string, unknown>): ResourcesSearch => ({
		item: typeof search.item === "string" ? search.item : undefined,
		view:
			typeof search.view === "string"
				? (search.view as BoardViewId)
				: undefined,
	}),
	component: ResourcesPage,
});

const SECTION_OF = (item: string): { section: string | null; kind: string } => {
	if (item.startsWith("board-")) return { section: "Boards", kind: "board" };
	if (item.startsWith("p-")) return { section: "Projects", kind: "pad" };
	if (item.startsWith("r-")) return { section: "Repos", kind: "pad" };
	if (item.startsWith("m-")) return { section: "Machines", kind: "pad" };
	if (item.startsWith("a-")) return { section: "Agents", kind: "pad" };
	return { section: null, kind: "pad" };
};

function ResourcesPage() {
	const { item = "board-eng", view = "board" } = Route.useSearch();
	const { kind, section } = SECTION_OF(item);

	return (
		<AppShell>
			{kind === "board" ? (
				<BoardWorkspace boardId={item} bview={view} />
			) : (
				<PadPage title={item} section={section} />
			)}
		</AppShell>
	);
}
