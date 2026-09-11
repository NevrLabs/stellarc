/**
 * Milestone progress / date inference.
 *
 * A milestone never carries its own hand-typed schedule or completion figure:
 * both are DERIVED from the tasks whose `milestoneId` points at the milestone.
 * Keeping the derivation here (pure, no React) means it can be unit-tested
 * without rendering the properties panel.
 */

export type MilestoneTaskLike = {
  id: string;
  status?: string | null;
  milestoneId?: string | null;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
};

export type MilestoneProgress = {
  /** Number of tasks linked to the milestone. */
  taskCount: number;
  /** Tasks in a terminal/done column. */
  completedCount: number;
  /** 0-100, rounded. 0 when there are no linked tasks. */
  percentComplete: number;
  /** Earliest known date across linked tasks, or null when none carry dates. */
  startDate: Date | null;
  /** Latest known date across linked tasks, or null when none carry dates. */
  endDate: Date | null;
};

const COMPLETED_STATUSES = new Set(["done", "completed", "complete", "closed"]);

/**
 * A task counts as complete when its column/status is a terminal one. Statuses
 * arrive as free-form column ids, so normalise before comparing.
 */
export function isCompletedStatus(status?: string | null): boolean {
  if (!status) return false;
  return COMPLETED_STATUSES.has(status.trim().toLowerCase());
}

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Filters `tasks` down to those linked to `milestoneId`.
 */
export function getMilestoneTasks<T extends MilestoneTaskLike>(
  tasks: readonly T[] | null | undefined,
  milestoneId: string,
): T[] {
  if (!tasks || !milestoneId) return [];
  return tasks.filter((task) => task.milestoneId === milestoneId);
}

/**
 * Infers a milestone's date range and completion percentage from the tasks
 * assigned to it. With zero linked tasks the milestone is 0% complete and has
 * no date range at all — callers render that as "no tasks yet" rather than
 * pretending the milestone is done.
 */
export function getMilestoneProgress<T extends MilestoneTaskLike>(
  tasks: readonly T[] | null | undefined,
  milestoneId: string,
): MilestoneProgress {
  const related = getMilestoneTasks(tasks, milestoneId);

  if (related.length === 0) {
    return {
      taskCount: 0,
      completedCount: 0,
      percentComplete: 0,
      startDate: null,
      endDate: null,
    };
  }

  let completedCount = 0;
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const task of related) {
    if (isCompletedStatus(task.status)) {
      completedCount += 1;
    }

    for (const candidate of [toDate(task.startDate), toDate(task.dueDate)]) {
      if (!candidate) continue;
      if (!earliest || candidate.getTime() < earliest.getTime()) {
        earliest = candidate;
      }
      if (!latest || candidate.getTime() > latest.getTime()) {
        latest = candidate;
      }
    }
  }

  return {
    taskCount: related.length,
    completedCount,
    percentComplete: Math.round((completedCount / related.length) * 100),
    startDate: earliest,
    endDate: latest,
  };
}

export default getMilestoneProgress;
