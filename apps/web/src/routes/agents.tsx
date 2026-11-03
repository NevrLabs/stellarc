import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell, PadPage } from "@/components/shell/AppShell";
import { hasFlag } from "@/lib/flags";

interface AgentsSearch {
	item?: string;
}

export const Route = createFileRoute("/agents")({
	validateSearch: (search: Record<string, unknown>): AgentsSearch => ({
		item: typeof search.item === "string" ? search.item : undefined,
	}),
	// The Agents view is behind a flag until its APIs land (ADR 0014 §6).
	beforeLoad: () => {
		if (!hasFlag("agents")) {
			throw redirect({ to: "/", search: { item: "inbox" } });
		}
	},
	component: AgentsPage,
});

function AgentsPage() {
	const { item = "s-229" } = Route.useSearch();
	return (
		<AppShell>
			<PadPage title={item} section="Agents" />
		</AppShell>
	);
}
