/*
 * The single data-access module for apps/web (orchestrator note on NEVR-433):
 * TanStack DB collections over local-only fixtures. These ARE real TanStack DB
 * collections, so optimistic mutation paths already work; NEVR-434 swaps each
 * `localOnlyCollectionOptions` for a synced adapter (query-db-collection first)
 * without touching any component — components only see the hooks in queries.ts.
 */
import {
	createCollection,
	localOnlyCollectionOptions,
} from "@tanstack/react-db";

import { fixtures } from "@/fixtures/data";

export const orgsCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (org) => org.id,
		initialData: fixtures.orgs,
	}),
);

export const viewsCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (view) => view.id,
		initialData: fixtures.views,
	}),
);

export const sectionsCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (section) => section.id,
		initialData: fixtures.sections,
	}),
);

export const recentCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (item) => item.id,
		initialData: fixtures.recent,
	}),
);

export const inboxCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (item) => item.id,
		initialData: fixtures.inbox,
	}),
);

export const boardsCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (board) => board.id,
		initialData: fixtures.boards,
	}),
);

export const statusesCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (status) => status.id,
		initialData: fixtures.statuses,
	}),
);

export const boardViewsCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (view) => view.id,
		initialData: fixtures.boardViews,
	}),
);

export const ticketsCollection = createCollection(
	localOnlyCollectionOptions({
		getKey: (ticket) => ticket.key,
		initialData: fixtures.tickets,
	}),
);
