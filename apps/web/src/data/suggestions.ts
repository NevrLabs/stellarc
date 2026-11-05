/*
 * NEVR-498 — onboarding suggestions derived from recorded activity.
 *
 * Pure derivation over the shapes the collections already hold (the NEVR-434
 * fixture→real-API seam): cluster the instance's own recorded tickets by the
 * workspace they ran in (boards today) inside a trailing 7-day window, and
 * name the evidence for every cluster. The Paseo v0.15.2 pattern (suggest
 * from where work actually happened, never from demo content): empty activity
 * in → no suggestions out. No clock reads, no storage, no I/O — callers pass
 * `now`, which keeps both prerender and tests deterministic.
 */
import type { Board, Ref, Ticket } from "@/fixtures/data";

/** Trailing window (days) a task must have started in to count as activity. */
export const SUGGESTION_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/** One cluster of recorded activity: what it is, its evidence, its action. */
export interface Suggestion {
	/** Stable identity — the dismissal key ("never re-promotes" is per id). */
	id: string;
	/** Workspace name (board label today). */
	label: string;
	/** Tasks recorded in the window — the number the evidence names. */
	count: number;
	/** Human sentence naming the evidence, e.g. "3 tasks ran here in the last 7 days". */
	evidence: string;
	/** Where "Open" lands — one action away from use. */
	ref: Ref;
}

function evidenceLine(count: number): string {
	return `${count} ${count === 1 ? "task" : "tasks"} ran here in the last ${SUGGESTION_WINDOW_DAYS} days`;
}

/**
 * Derive suggestions from recorded tickets. A ticket counts as activity when
 * it is not backlog (work was actually scheduled there) and its start date
 * falls inside (now − 7 days, now]. Boards with no in-window tasks yield no
 * suggestion — the absence is honest, not hidden.
 */
export function deriveSuggestions(
	tickets: Ticket[],
	boards: Board[],
	now: number,
): Suggestion[] {
	const from = now - SUGGESTION_WINDOW_DAYS * DAY_MS;
	const counts = new Map<string, number>();
	for (const t of tickets) {
		if (t.status === "backlog" || !t.start) continue;
		const started = Date.parse(`${t.start}T00:00:00Z`);
		if (Number.isNaN(started) || started > now || started <= from) continue;
		counts.set(t.boardId, (counts.get(t.boardId) ?? 0) + 1);
	}
	const suggestions: Suggestion[] = [];
	for (const board of boards) {
		const count = counts.get(board.id);
		if (!count) continue;
		suggestions.push({
			id: board.id,
			label: board.label,
			count,
			evidence: evidenceLine(count),
			ref: { view: "resources", item: board.id },
		});
	}
	return suggestions.sort(
		(a, b) => b.count - a.count || a.label.localeCompare(b.label),
	);
}
