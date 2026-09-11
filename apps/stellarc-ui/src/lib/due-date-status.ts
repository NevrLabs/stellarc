export type DueDateStatus =
  | "overdue"
  | "due-soon"
  | "far-future"
  | "no-due-date"
  /**
   * #178: the task is finished. Its due date is history, so it must not shout
   * in destructive red next to completed work.
   */
  | "completed";

type CompletionColumn = { slug: string; isFinal: boolean };

// Columns are user-configurable, so completion comes from the column's isFinal
// flag. The slug check is the fallback for surfaces that render before columns
// load, or that never have them.
export function isTaskCompleted(
  status: string,
  columns?: CompletionColumn[],
): boolean {
  if (columns?.length) {
    return columns.find((column) => column.slug === status)?.isFinal ?? false;
  }
  return status === "done" || status === "archived";
}

/**
 * Kept for backwards compat — surfaces that don't have column metadata.
 */
export function isCompletedStatus(status: string | null | undefined): boolean {
  return status === "done" || status === "archived";
}

export function getDueDateStatus(
  dueDate: string | null,
  status?: string | null | boolean,
): DueDateStatus {
  if (!dueDate) return "no-due-date";

  const completed =
    typeof status === "boolean"
      ? status
      : isCompletedStatus(typeof status === "string" ? status : null);

  // #178: completion wins over lateness — a delivered ticket isn't "overdue".
  if (completed) return "completed";

  const now = new Date();
  const due = new Date(dueDate);
  const diffInDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffInDays < 0) return "overdue";
  if (diffInDays <= 3) return "due-soon";
  return "far-future";
}

/**
 * How a finished task landed against its due date (#178).
 *
 * `on-time` is the 24-hour window around the due date, per the ticket: hitting
 * the date to the day is "on time", not "early" and not "late".
 *
 * LIMITATION: tasks carry no completion timestamp — the schema has only
 * `updatedAt`, which any later edit also bumps. Callers therefore pass
 * `updatedAt` as an approximation, so editing a long-finished task can shift
 * its remark. Fixing that properly needs a `completedAt` column (or reading the
 * `status_changed` activity row), which is out of scope here.
 */
export type DueDateOutcome = "early" | "on-time" | "late";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export function getDueDateOutcome(
  dueDate: string | null,
  completedAt?: string | Date | null,
): DueDateOutcome | null {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;

  // Without a completion timestamp the best available reference is "now": the
  // task is done, so this is when we observed it done.
  const finished = completedAt ? new Date(completedAt) : new Date();
  if (Number.isNaN(finished.getTime())) return null;

  const diff = finished.getTime() - due.getTime();

  if (Math.abs(diff) <= ONE_DAY_MS) return "on-time";
  return diff < 0 ? "early" : "late";
}

export const dueDateStatusColors = {
  overdue: "bg-destructive/10 text-destructive-foreground",
  "due-soon": "bg-warning/10 text-warning-foreground",
  "far-future": "bg-muted/50 text-muted-foreground",
  "no-due-date": "bg-muted/50 text-muted-foreground",
  /*
    #178: quiet, but still legible. `bg-muted` is only ~4% alpha and
    `text-muted-foreground/70` on top of it was almost unreadable in review, so
    the label keeps full muted-foreground weight and the surface is a slightly
    firmer tint than the raw token.
  */
  completed: "bg-foreground/5 text-muted-foreground",
} as const;

export const dueDateStatusIcons = {
  overdue: "calendar-x",
  "due-soon": "calendar-clock",
  "far-future": "calendar",
  "no-due-date": "calendar",
  completed: "calendar-check",
} as const;
