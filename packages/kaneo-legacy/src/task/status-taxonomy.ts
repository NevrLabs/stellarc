/**
 * #226: the task status taxonomy.
 *
 * ## Why this file exists
 *
 * Status slugs are a PERSISTENCE CONTRACT — 1,741 rows already store them. So the
 * pre-existing slugs (`to-do`, `in-progress`, `in-review`, `done`, `planned`) are
 * frozen: never rename one, never re-point one at a different meaning. New states
 * are APPENDED. `status-taxonomy.test.ts` pins this and will fail if anyone
 * "tidies" it.
 *
 * ## Archive is NOT a status (ticket correction)
 *
 * > "correction, do not remove Archived. Archive is a separate status to hide it
 * > from all views. Archived item retains its status."
 *
 * Archival previously overwrote `status` with `"archived"`, destroying the real
 * workflow state. It is now `task.archived_at` (migration 0062) — orthogonal to
 * status, so an archived ticket keeps being In Progress / Done / whatever.
 * `"archived"` therefore does NOT appear below.
 *
 * ## Groups come from the ticket verbatim
 *
 *   Unstarted: To Do
 *   Started:   In Progress, In Review
 *   Finished:  Done
 *   Backlog:   Planned, Triage      ← "Triage is similar to Planned. by default
 *                                      it's above planned."
 *   Cancelled: Canceled
 *   Duplicate: Duplicate
 */

/** Where a status sits in the product's information architecture. */
export type StatusGroup =
  | "unstarted"
  | "started"
  | "finished"
  | "backlog"
  | "cancelled"
  | "duplicate";

export type StatusDefinition = {
  /** Stored in `task.status`. FROZEN for pre-existing values. */
  slug: string;
  /** Display name. Safe to change; the slug is the contract. */
  name: string;
  group: StatusGroup;
  /**
   * True when the status means "no longer active work" — Done, Canceled and
   * Duplicate. Used for progress counts and due-date suppression: a canceled
   * ticket must not be nagged about being overdue.
   */
  isClosed: boolean;
  /**
   * True when the status lives in the Backlog surface rather than on the Kanban
   * board. Backlog statuses have no `column` row.
   */
  isBacklog: boolean;
};

/**
 * Canonical order. Within Backlog, Triage sits ABOVE Planned per the ticket.
 *
 * ⚠️ APPEND-ONLY. Do not reorder to change board layout — per-board ordering is
 * configurable (see `board.status_order`); this is only the default.
 */
export const STATUS_DEFINITIONS: readonly StatusDefinition[] = [
  // --- pre-existing slugs: frozen, do not rename or re-point ---
  {
    slug: "to-do",
    name: "To Do",
    group: "unstarted",
    isClosed: false,
    isBacklog: false,
  },
  {
    slug: "in-progress",
    name: "In Progress",
    group: "started",
    isClosed: false,
    isBacklog: false,
  },
  {
    slug: "in-review",
    name: "In Review",
    group: "started",
    isClosed: false,
    isBacklog: false,
  },
  {
    slug: "done",
    name: "Done",
    group: "finished",
    isClosed: true,
    isBacklog: false,
  },
  /*
    #226: "Triage is similar to Planned. by default it's above planned."
    Triage is listed BEFORE planned so the default backlog order matches the
    ticket. `planned` keeps its frozen slug and meaning; only ordering changed,
    and ordering is not persisted per row.
  */
  {
    slug: "triage",
    name: "Triage",
    group: "backlog",
    isClosed: false,
    isBacklog: true,
  },
  {
    slug: "planned",
    name: "Planned",
    group: "backlog",
    isClosed: false,
    isBacklog: true,
  },
  // --- #226: terminal outcomes ---
  {
    slug: "canceled",
    name: "Canceled",
    group: "cancelled",
    isClosed: true,
    isBacklog: false,
  },
  {
    slug: "duplicate",
    name: "Duplicate",
    group: "duplicate",
    isClosed: true,
    isBacklog: false,
  },
] as const;

/** Every valid status slug, in canonical order. */
export const STATUS_SLUGS: readonly string[] = STATUS_DEFINITIONS.map(
  (definition) => definition.slug,
);

/**
 * Statuses that are NOT Kanban columns: the backlog states plus the terminal
 * Canceled/Duplicate outcomes. These have no `column` row, so validation has to
 * allow them explicitly.
 *
 * Replaces the old `VIRTUAL_STATUSES = ["planned", "archived"]`. `archived` is
 * gone from it because archival is no longer a status at all.
 */
export const NON_COLUMN_STATUS_SLUGS: readonly string[] =
  STATUS_DEFINITIONS.filter(
    (definition) =>
      definition.isBacklog ||
      definition.group === "cancelled" ||
      definition.group === "duplicate",
  ).map((definition) => definition.slug);

/** Backlog-only statuses, in canonical order (Triage above Planned). */
export const BACKLOG_STATUS_SLUGS: readonly string[] =
  STATUS_DEFINITIONS.filter((definition) => definition.isBacklog).map(
    (definition) => definition.slug,
  );

/** Statuses meaning "not active work" — Done, Canceled, Duplicate. */
export const CLOSED_STATUS_SLUGS: readonly string[] = STATUS_DEFINITIONS.filter(
  (definition) => definition.isClosed,
).map((definition) => definition.slug);

const DEFINITION_BY_SLUG = new Map(
  STATUS_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function getStatusDefinition(
  slug: string,
): StatusDefinition | undefined {
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

/**
 * Apply a board's configured status order.
 *
 * Unknown slugs in the stored order are ignored (a status could be removed from
 * the vocabulary later), and any status missing from it keeps its canonical
 * position at the end — so a partially-configured board still shows every
 * status instead of silently dropping the ones nobody ordered yet.
 */
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
