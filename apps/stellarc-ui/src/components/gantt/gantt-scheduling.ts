import { parseISO } from "date-fns";

/**
 * Timeline scheduling helpers.
 *
 * The timeline used to silently drop every task without a start/due date: they
 * were mapped to `null` and filtered out, so a task with no dates was invisible
 * in this view and there was no way to notice — let alone schedule — it. These
 * helpers split the list instead of shrinking it, so the view can render the
 * dateless tasks in their own "Unscheduled" group.
 */

export type SchedulableTask = {
  startDate: string | null;
  dueDate: string | null;
};

export type ScheduleRange = {
  scheduleStart: Date;
  scheduleEnd: Date;
};

export function parseTaskDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A task is schedulable when at least one of its dates parses; a single date
 * anchors both ends of the bar. Ends are normalised so start <= end even when
 * the stored dates are inverted.
 */
export function resolveScheduleRange(
  task: SchedulableTask,
): ScheduleRange | null {
  const parsedStart =
    parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
  const parsedEnd =
    parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);
  if (!parsedStart || !parsedEnd) return null;
  return {
    scheduleStart: parsedStart <= parsedEnd ? parsedStart : parsedEnd,
    scheduleEnd: parsedEnd >= parsedStart ? parsedEnd : parsedStart,
  };
}

/**
 * Split tasks into the ones that can be drawn as bars and the ones that cannot.
 * Scheduled tasks are ordered by start date (the timeline's reading order);
 * unscheduled tasks keep their incoming order so the caller's sort wins.
 */
export function partitionTasksBySchedule<T extends SchedulableTask>(
  tasks: T[],
): { scheduled: (T & ScheduleRange)[]; unscheduled: T[] } {
  const scheduled: (T & ScheduleRange)[] = [];
  const unscheduled: T[] = [];

  for (const task of tasks) {
    const range = resolveScheduleRange(task);
    if (range) scheduled.push({ ...task, ...range });
    else unscheduled.push(task);
  }

  scheduled.sort(
    (left, right) =>
      left.scheduleStart.getTime() - right.scheduleStart.getTime(),
  );

  return { scheduled, unscheduled };
}

export type SearchableTask = {
  title: string;
  status: string;
  number: number | null;
};

/** Same match rules the timeline search box has always used. */
export function matchesTaskQuery(
  task: SearchableTask,
  query: string,
  boardSlug: string | undefined,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;
  return (
    task.title.toLowerCase().includes(normalizedQuery) ||
    `${boardSlug ?? ""}-${task.number ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery) ||
    task.status.toLowerCase().includes(normalizedQuery)
  );
}
