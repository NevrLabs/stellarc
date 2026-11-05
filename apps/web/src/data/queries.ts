/*
 * Data hooks: useLiveQuery over the collections in collections.ts. Components
 * consume only these hooks (plus the bare collections for mutations), never
 * the fixtures — that is the seam NEVR-434 re-points at the real API.
 */
import { eq, useLiveQuery } from "@tanstack/react-db";

import {
	boardsCollection,
	boardViewsCollection,
	inboxCollection,
	orgsCollection,
	recentCollection,
	sectionsCollection,
	statusesCollection,
	ticketsCollection,
	viewsCollection,
} from "@/data/collections";
import { deriveSuggestions } from "@/data/suggestions";
import type { StatusId, ViewId } from "@/fixtures/data";

export function useOrgs() {
	return useLiveQuery({
		query: (q) => q.from({ org: orgsCollection }),
	}).data;
}

export function useViews() {
	return useLiveQuery({
		query: (q) =>
			q.from({ view: viewsCollection }).orderBy(({ view }) => view.id, "asc"),
	}).data;
}

export function useSidebarSections(view: ViewId) {
	return useLiveQuery({
		query: (q) =>
			q
				.from({ section: sectionsCollection })
				.where(({ section }) => eq(section.view, view))
				.orderBy(({ section }) => section.order, "asc"),
	}).data;
}

export function useRecent() {
	return useLiveQuery({
		query: (q) =>
			q.from({ item: recentCollection }).orderBy(({ item }) => item.id, "asc"),
	}).data;
}

export function useInbox() {
	return useLiveQuery({
		query: (q) =>
			q.from({ item: inboxCollection }).orderBy(({ item }) => item.id, "asc"),
	}).data;
}

export function useBoards() {
	return useLiveQuery({
		query: (q) =>
			q
				.from({ board: boardsCollection })
				.orderBy(({ board }) => board.id, "asc"),
	}).data;
}

export function useBoard(id: string | undefined) {
	return useLiveQuery({
		query: (q) => {
			if (!id) return undefined;
			return q
				.from({ board: boardsCollection })
				.where(({ board }) => eq(board.id, id));
		},
	}).data;
}

export function useStatuses() {
	return useLiveQuery({
		query: (q) =>
			q
				.from({ status: statusesCollection })
				.orderBy(({ status }) => status.order, "asc"),
	}).data;
}

export function useBoardViews() {
	return useLiveQuery({
		query: (q) =>
			q
				.from({ view: boardViewsCollection })
				.orderBy(({ view }) => (view.custom ? 1 : 0), "asc"),
	}).data;
}

/** Tickets of one board (all statuses, backlog included). */
export function useBoardTickets(boardId: string | undefined) {
	return useLiveQuery({
		query: (q) => {
			if (!boardId) return undefined;
			return q
				.from({ ticket: ticketsCollection })
				.where(({ ticket }) => eq(ticket.boardId, boardId));
		},
	}).data;
}

/** Tickets whose status is not backlog — what the board/list/timeline show. */
export function useActiveTickets(boardId: string | undefined) {
	const tickets = useBoardTickets(boardId);
	return tickets?.filter((t) => t.status !== "backlog");
}

/** All recorded tickets, across boards (NEVR-498 activity source). */
export function useTickets() {
	return useLiveQuery({
		query: (q) => q.from({ ticket: ticketsCollection }),
	}).data;
}

/**
 * NEVR-498 — onboarding suggestions derived from recorded activity, through
 * this seam only, so the derivation follows the NEVR-434 fixture→real-API
 * flip untouched.
 */
export function useSuggestions() {
	const tickets = useTickets() ?? [];
	const boards = useBoards() ?? [];
	return deriveSuggestions(tickets, boards, Date.now());
}

export function useTicketsByStatus(
	boardId: string | undefined,
	status: StatusId,
) {
	const tickets = useBoardTickets(boardId);
	return tickets?.filter((t) => t.status === status);
}
