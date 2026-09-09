import { startOfDay } from "date-fns";
import type { Milestone } from "@/fetchers/milestone/get-milestones-by-board";
import {
  getMilestoneProgress,
  getMilestoneTasks,
  type MilestoneTaskLike,
} from "@/lib/milestone-progress";

export type GanttMilestone = {
  id: string;
  name: string;
  status: string;
  taskIds: string[];
  taskCount: number;
  completedCount: number;
  percentComplete: number;
  spanStart: Date | null;
  spanEnd: Date | null;
  targetDate: Date | null;
  targetIsExplicit: boolean;
};

function validDay(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

/**
 * Creates the milestone rows consumed by the Gantt. The target marker honours
 * the milestone's explicit due date; without one it falls back to the inferred
 * end of its related tasks. Span and completion always come from related tasks.
 */
export function buildGanttMilestones(
  milestones: readonly Milestone[] | null | undefined,
  tasks: readonly MilestoneTaskLike[] | null | undefined,
): GanttMilestone[] {
  return (milestones ?? []).map((milestone) => {
    const progress = getMilestoneProgress(tasks, milestone.id);
    const related = getMilestoneTasks(tasks, milestone.id);
    const explicitDueDate = validDay(milestone.dueDate);
    return {
      id: milestone.id,
      name: milestone.name,
      status: milestone.status,
      taskIds: related.map((task) => task.id),
      taskCount: progress.taskCount,
      completedCount: progress.completedCount,
      percentComplete: progress.percentComplete,
      spanStart: validDay(progress.startDate),
      spanEnd: validDay(progress.endDate),
      targetDate: explicitDueDate ?? validDay(progress.endDate),
      targetIsExplicit: explicitDueDate !== null,
    };
  });
}

export function milestoneTimelineDates(
  milestones: readonly GanttMilestone[],
): Date[] {
  return milestones.flatMap((milestone) =>
    [milestone.spanStart, milestone.spanEnd, milestone.targetDate].filter(
      (date): date is Date => date !== null,
    ),
  );
}

export function milestoneMatchesQuery(
  milestone: GanttMilestone,
  query: string,
  matchingTaskIds: ReadonlySet<string>,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    milestone.name.toLowerCase().includes(normalized) ||
    milestone.taskIds.some((id) => matchingTaskIds.has(id))
  );
}

export type { MilestoneTaskLike };
