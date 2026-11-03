import { createFileRoute } from "@tanstack/react-router";
import {
	HomeToolbar,
	InboxView,
	MyTicketsView,
} from "@/components/home/HomeViews";
import { AppShell, useFirstBoardId } from "@/components/shell/AppShell";
import { useBoards } from "@/data/queries";

type HomeSearch = { item?: string };

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): HomeSearch => ({
		item: typeof search.item === "string" ? search.item : undefined,
	}),
	component: HomePage,
});

function HomePage() {
	const { item = "inbox" } = Route.useSearch();
	const firstBoardId = useFirstBoardId();
	const boards = useBoards() ?? [];
	const boardId = firstBoardId ?? boards[0]?.id;

	return (
		<AppShell>
			{item === "mine" ? (
				<main className="work">
					<HomeToolbar activeItem={item} />
					<div className="vp">
						{boardId && <MyTicketsView boardId={boardId} />}
					</div>
				</main>
			) : (
				<main className="work">
					<HomeToolbar activeItem="inbox" />
					<div className="vp">
						<InboxView />
					</div>
				</main>
			)}
		</AppShell>
	);
}
