import {
  Ban,
  Check,
  Circle,
  CircleDot,
  Copy,
  Inbox,
  Search,
} from "lucide-react";

/**
 * #226: display copy of the persisted task status taxonomy.
 *
 * The API's source of truth is `apps/api/src/task/status-taxonomy.ts`; this copy
 * carries React icon components, so it cannot live in the API module. The API
 * contract test pins the stored slugs; the web component tests pin that every
 * same slug renders here. If you append a status, update BOTH copies together.
 *
 * Archive is DELIBERATELY absent: archival is `task.archived_at`, orthogonal to
 * status. An archived ticket retains whatever status it had.
 */
export const TASK_STATUS_DEFINITIONS = [
  {
    slug: "to-do",
    name: "To Do",
    group: "unstarted",
    icon: Circle,
    isClosed: false,
    isBacklog: false,
  },
  {
    slug: "in-progress",
    name: "In Progress",
    group: "started",
    icon: CircleDot,
    isClosed: false,
    isBacklog: false,
  },
  {
    slug: "in-review",
    name: "In Review",
    group: "started",
    icon: Search,
    isClosed: false,
    isBacklog: false,
  },
  {
    slug: "done",
    name: "Done",
    group: "finished",
    icon: Check,
    isClosed: true,
    isBacklog: false,
  },
  // Ticket: "Triage is similar to Planned. by default it's above planned."
  {
    slug: "triage",
    name: "Triage",
    group: "backlog",
    icon: Inbox,
    isClosed: false,
    isBacklog: true,
  },
  {
    slug: "planned",
    name: "Planned",
    group: "backlog",
    icon: Circle,
    isClosed: false,
    isBacklog: true,
  },
  {
    slug: "canceled",
    name: "Canceled",
    group: "cancelled",
    icon: Ban,
    isClosed: true,
    isBacklog: false,
  },
  {
    slug: "duplicate",
    name: "Duplicate",
    group: "duplicate",
    icon: Copy,
    isClosed: true,
    isBacklog: false,
  },
] as const;

export type TaskStatusSlug = (typeof TASK_STATUS_DEFINITIONS)[number]["slug"];
export type TaskStatusGroup = (typeof TASK_STATUS_DEFINITIONS)[number]["group"];

export const TASK_STATUS_SLUGS = TASK_STATUS_DEFINITIONS.map(
  (status) => status.slug,
);

export const BACKLOG_STATUS_DEFINITIONS = TASK_STATUS_DEFINITIONS.filter(
  (status) => status.isBacklog,
);

export const NON_BACKLOG_STATUS_DEFINITIONS = TASK_STATUS_DEFINITIONS.filter(
  (status) => !status.isBacklog,
);

export const CLOSED_TASK_STATUS_SLUGS = TASK_STATUS_DEFINITIONS.filter(
  (status) => status.isClosed,
).map((status) => status.slug);

export function getTaskStatusDefinition(slug: string) {
  return TASK_STATUS_DEFINITIONS.find((status) => status.slug === slug);
}

export function isClosedTaskStatus(slug: string) {
  return getTaskStatusDefinition(slug)?.isClosed === true;
}

export function isBacklogTaskStatus(slug: string) {
  return getTaskStatusDefinition(slug)?.isBacklog === true;
}

/** Apply board-specific order without ever dropping newly-added statuses. */
export function applyTaskStatusOrder<T extends { slug: string }>(
  definitions: readonly T[],
  configuredOrder: readonly string[] | null | undefined,
): T[] {
  if (!configuredOrder?.length) return [...definitions];

  const bySlug = new Map(
    definitions.map((definition) => [definition.slug, definition]),
  );
  const ordered: T[] = [];

  for (const slug of configuredOrder) {
    const definition = bySlug.get(slug);
    if (definition) {
      ordered.push(definition);
      bySlug.delete(slug);
    }
  }

  return [...ordered, ...bySlug.values()];
}

/**
 * Backward-compatible alias for old consumers. These are the four Kanban lanes,
 * not the full vocabulary. Existing slugs/semantics are frozen.
 */
export const DEFAULT_COLUMNS = TASK_STATUS_DEFINITIONS.filter(
  (status) =>
    status.slug === "to-do" ||
    status.slug === "in-progress" ||
    status.slug === "in-review" ||
    status.slug === "done",
).map(({ slug, name, icon }) => ({ id: slug, name, icon }));
