/**
 * Display-side compaction for the activity feed (#116).
 *
 * "if user move a task from todo to in progress to todo -> in review -> done in
 * a short period (within a minute), keep only the total delta ... or just
 * compact all of that into a single entry ... with a dropdown showing all the
 * actions. pure frontend changes to make it more compact."
 *
 * Nothing is deleted: every original entry is carried on the group so the UI
 * can expand it. Only the *rendering* collapses.
 */
/**
 * The minimum an activity must expose to be grouped. Callers pass their own
 * richer type and the generic preserves it, so grouping never widens what the
 * UI receives. An index signature is deliberately NOT used here: it would stop
 * concrete object types satisfying the constraint by inference.
 */
export type CompactableActivity = {
  id: string;
  type: string;
  userId: string | null;
  createdAt: string;
  eventData?: unknown;
};

export type ActivityGroup<T extends CompactableActivity> = {
  /** The entry to render. For a run, the FIRST (oldest) of the run. */
  head: T;
  /** Every entry in the run, oldest first. Length 1 when nothing collapsed. */
  entries: T[];
  /** Status the run started from, when this is a collapsed status run. */
  fromStatus?: string;
  /** Status the run ended at. */
  toStatus?: string;
};

/** Default window: consecutive changes inside a minute belong together. */
export const COMPACT_WINDOW_MS = 60_000;

function statusOf(activity: CompactableActivity) {
  const data = activity.eventData as
    | { oldStatus?: unknown; newStatus?: unknown }
    | null
    | undefined;
  const oldStatus =
    typeof data?.oldStatus === "string" ? data.oldStatus : undefined;
  const newStatus =
    typeof data?.newStatus === "string" ? data.newStatus : undefined;
  return { oldStatus, newStatus };
}

function time(value: string) {
  return new Date(value).getTime();
}

/**
 * Collapses consecutive same-user status changes that happened inside
 * `windowMs` of each other into one group.
 *
 * Deliberately narrow:
 *   - only `status_changed` collapses; comments and every other event stay
 *     as they are, because losing a comment in a fold would be much worse
 *     than a slightly long feed;
 *   - the run must be by the SAME user — two people moving a ticket is two
 *     distinct facts;
 *   - the gap is measured between ADJACENT entries, so a slow drip of changes
 *     never silently folds into one entry;
 *   - a run that returns to where it started (to-do -> in progress -> to-do)
 *     still groups, but reports fromStatus === toStatus so the UI can say
 *     nothing net changed rather than claiming a move.
 *
 * `activities` may be in either order; the result follows the input order.
 */
export function compactActivities<T extends CompactableActivity>(
  activities: T[],
  windowMs: number = COMPACT_WINDOW_MS,
): ActivityGroup<T>[] {
  const groups: ActivityGroup<T>[] = [];

  for (const activity of activities) {
    const previous = groups[groups.length - 1];
    const isStatus = activity.type === "status_changed";

    if (previous && isStatus && previous.head.type === "status_changed") {
      const last = previous.entries[previous.entries.length - 1];
      const sameUser = (last.userId ?? null) === (activity.userId ?? null);
      const gap = Math.abs(time(activity.createdAt) - time(last.createdAt));

      if (sameUser && gap <= windowMs) {
        previous.entries.push(activity);
        // The run's endpoints follow the input order: whichever entry is
        // chronologically later supplies the destination.
        const first = previous.entries[0];
        const latest = previous.entries[previous.entries.length - 1];
        const ordered =
          time(latest.createdAt) >= time(first.createdAt)
            ? [first, latest]
            : [latest, first];
        previous.fromStatus = statusOf(ordered[0]).oldStatus;
        previous.toStatus = statusOf(ordered[1]).newStatus;
        continue;
      }
    }

    const { oldStatus, newStatus } = statusOf(activity);
    groups.push({
      head: activity,
      entries: [activity],
      ...(isStatus ? { fromStatus: oldStatus, toStatus: newStatus } : {}),
    });
  }

  return groups;
}

/** True when a group folded more than one entry and is worth expanding. */
export function isCollapsedRun<T extends CompactableActivity>(
  group: ActivityGroup<T>,
) {
  return group.entries.length > 1;
}

/**
 * True when a collapsed run ended where it began, e.g. to-do -> in progress
 * -> to-do. The UI should not claim a move in that case.
 */
export function isNoOpRun<T extends CompactableActivity>(
  group: ActivityGroup<T>,
) {
  return (
    isCollapsedRun(group) &&
    group.fromStatus !== undefined &&
    group.fromStatus === group.toStatus
  );
}

export default compactActivities;
