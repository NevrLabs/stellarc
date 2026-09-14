/** Status taxonomy — behavioral mirror of fork apps/api/src/task/status-taxonomy.ts.
 * Slugs are a PERSISTENCE CONTRACT: frozen, append-only. Never rename or re-point. */

export type StatusGroup =
	| "unstarted"
	| "started"
	| "finished"
	| "backlog"
	| "cancelled"
	| "duplicate";

export type StatusDefinition = {
	readonly slug: string;
	readonly name: string;
	readonly group: StatusGroup;
	readonly isClosed: boolean;
	readonly isBacklog: boolean;
};

/** Canonical order. Triage sits ABOVE Planned. APPEND-ONLY. */
export const STATUS_DEFINITIONS: readonly StatusDefinition[] =
	Object.freeze([
		{ slug: "to-do", name: "To Do", group: "unstarted", isClosed: false, isBacklog: false },
		{ slug: "in-progress", name: "In Progress", group: "started", isClosed: false, isBacklog: false },
		{ slug: "in-review", name: "In Review", group: "started", isClosed: false, isBacklog: false },
		{ slug: "done", name: "Done", group: "finished", isClosed: true, isBacklog: false },
		{ slug: "triage", name: "Triage", group: "backlog", isClosed: false, isBacklog: true },
		{ slug: "planned", name: "Planned", group: "backlog", isClosed: false, isBacklog: true },
		{ slug: "canceled", name: "Canceled", group: "cancelled", isClosed: true, isBacklog: false },
		{ slug: "duplicate", name: "Duplicate", group: "duplicate", isClosed: true, isBacklog: false },
	] satisfies readonly StatusDefinition[]);

export const STATUS_SLUGS: readonly string[] = Object.freeze(
	STATUS_DEFINITIONS.map((d) => d.slug),
);

/** Statuses without a `column` row: backlog states + terminal outcomes.
 * Archival is NOT a status — archived tickets keep their real status. */
export const NON_COLUMN_STATUS_SLUGS: readonly string[] = Object.freeze(
	STATUS_DEFINITIONS.filter(
		(d) => d.isBacklog || d.group === "cancelled" || d.group === "duplicate",
	).map((d) => d.slug),
);

/** Virtual statuses per spec §2: no rows, never emit events. */
export const VIRTUAL_STATUS_SLUGS = NON_COLUMN_STATUS_SLUGS;

export const BACKLOG_STATUS_SLUGS: readonly string[] = Object.freeze(
	STATUS_DEFINITIONS.filter((d) => d.isBacklog).map((d) => d.slug),
);

export const CLOSED_STATUS_SLUGS: readonly string[] = Object.freeze(
	STATUS_DEFINITIONS.filter((d) => d.isClosed).map((d) => d.slug),
);

const DEFINITION_BY_SLUG = new Map(
	STATUS_DEFINITIONS.map((d) => [d.slug, d] as const),
);

export function getStatusDefinition(slug: string): StatusDefinition | undefined {
	return DEFINITION_BY_SLUG.get(slug);
}

export function isKnownStatus(slug: string): boolean {
	return DEFINITION_BY_SLUG.has(slug);
}

export function isClosedStatus(slug: string): boolean {
	return DEFINITION_BY_SLUG.get(slug)?.isClosed === true;
}

export function isBacklogStatus(slug: string): boolean {
	return DEFINITION_BY_SLUG.get(slug)?.isBacklog === true;
}

/** Apply a board's configured order; unknown slugs ignored, missing appended. */
export function applyStatusOrder(
	slugs: readonly string[],
	configuredOrder: readonly string[] | null | undefined,
): string[] {
	if (!configuredOrder?.length) return [...slugs];
	const present = new Set(slugs);
	const ordered = configuredOrder.filter((slug) => present.has(slug));
	const seen = new Set(ordered);
	return [...ordered, ...slugs.filter((slug) => !seen.has(slug))];
}
