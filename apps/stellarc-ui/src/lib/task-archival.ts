import type Task from "@/types/task";

/**
 * #226: archival is ORTHOGONAL to status.
 *
 * Migration 0062 moved archival off `task.status` onto `task.archived_at` and
 * dropped `"archived"` from the valid status vocabulary. Any code that still
 * writes `status: "archived"` now fails validation with:
 *
 *   Invalid status "archived". Valid statuses for this board: to-do, ...
 *
 * These helpers are the single source of truth for the two rules that fixes it:
 *   1. an archived ticket KEEPS its real workflow status
 *   2. section membership is decided by `archivedAt`, never by status
 */

export type BacklogSection = "planned" | "archived";

type ArchivableTask = Pick<Task, "status"> & { archivedAt?: string | null };

/**
 * Which backlog section a row belongs to.
 *
 * The old code tested `task.status === "planned"`, which mis-classified every
 * archived ticket whose status was not literally "planned" (an archived Done
 * ticket looked like a Planned one) and moved the wrong row on drop.
 */
export function backlogSectionOf(task: ArchivableTask): BacklogSection {
  return task.archivedAt ? "archived" : "planned";
}

export function isArchived(task: ArchivableTask): boolean {
  return Boolean(task.archivedAt);
}

/**
 * What crossing a backlog section boundary must persist.
 *
 * Archiving toggles `archived_at` and leaves status alone, so a Done ticket is
 * still Done while archived. Leaving Archived for Planned is the one direction
 * that also sets a status, because Planned is a real status the ticket adopts.
 */
export function sectionCrossPayload({
  task,
  targetSection,
}: {
  task: ArchivableTask;
  targetSection: BacklogSection;
}): { archived: boolean; status: string } {
  if (targetSection === "archived") {
    return { archived: true, status: task.status };
  }
  return { archived: false, status: "planned" };
}
