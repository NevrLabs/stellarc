/*
 * NEVR-498 — test/debug affordance: expose the local-only collections on
 * window so the e2e suite can drive the instance into states the fixtures
 * cannot express (e.g. zero recorded activity) through the same mutation →
 * live-query seam the app itself uses. Page-local handle only: nothing
 * leaves the browser, nothing is fetched.
 */
import {
	boardsCollection,
	inboxCollection,
	recentCollection,
	ticketsCollection,
} from "@/data/collections";

declare global {
	interface Window {
		__stellarc?: {
			collections: {
				boards: typeof boardsCollection;
				inbox: typeof inboxCollection;
				recent: typeof recentCollection;
				tickets: typeof ticketsCollection;
			};
		};
	}
}

if (typeof window !== "undefined" && !window.__stellarc) {
	window.__stellarc = {
		collections: {
			boards: boardsCollection,
			inbox: inboxCollection,
			recent: recentCollection,
			tickets: ticketsCollection,
		},
	};
}
