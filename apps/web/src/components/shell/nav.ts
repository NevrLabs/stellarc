import { useNavigate } from "@tanstack/react-router";

import type { BoardViewId, Ref, ViewId } from "@/fixtures/data";

const ROUTE_OF: Record<ViewId, "/" | "/resources" | "/agents"> = {
	home: "/",
	resources: "/resources",
	agents: "/agents",
};

export { ROUTE_OF };

/** Navigate to a mockup-style `{view, item, bview}` target with typed search. */
export function useGo() {
	const navigate = useNavigate();
	return (ref: Ref | { view: ViewId; item?: string; bview?: BoardViewId }) => {
		const search: { item?: string; view?: BoardViewId } = {};
		if (ref.item) search.item = ref.item;
		if (ref.bview && ref.bview !== "board") search.view = ref.bview;
		navigate({ to: ROUTE_OF[ref.view], search });
	};
}
