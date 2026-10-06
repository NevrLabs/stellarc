/**
 * #108: collapse rapid title edits into a single activity entry.
 *
 * Debouncing the *save* (client side) reduces write volume but does not solve
 * the history problem: a title edited over 30 seconds with natural pauses still
 * produces one `title_changed` row per pause. The requested behaviour is that
 * consecutive title changes by the same user inside a short window read as one
 * rename — from the original title to the final one.
 *
 * The rule lives here, free of Drizzle and HTTP, so the window arithmetic can
 * be tested directly instead of through a live database.
 */

/** How close together two title edits must be to count as one rename. */
export const TITLE_ACTIVITY_COALESCE_WINDOW_MS = 60_000;

export type TitleActivityRow = {
  id: string;
  userId: string | null;
  createdAt: Date;
  eventData: unknown;
};

export type TitleChangeEventData = {
  oldTitle: string | null;
  newTitle: string | null;
};

/**
 * Reads `{ oldTitle, newTitle }` off an activity row, tolerating the loose
 * `jsonb` typing and rows written by older code paths.
 */
export function readTitleChangeEventData(
  eventData: unknown,
): TitleChangeEventData | null {
  if (typeof eventData !== "object" || eventData === null) return null;
  const data = eventData as Record<string, unknown>;
  const oldTitle = data.oldTitle;
  const newTitle = data.newTitle;
  const isNullableString = (value: unknown) =>
    typeof value === "string" || value === null || value === undefined;
  if (!isNullableString(oldTitle) || !isNullableString(newTitle)) return null;
  return {
    oldTitle: (oldTitle as string | null | undefined) ?? null,
    newTitle: (newTitle as string | null | undefined) ?? null,
  };
}

export type TitleActivityDecision =
  | { action: "insert" }
  | {
      action: "update";
      activityId: string;
      /**
       * The title the collapsed entry should report as the starting point: the
       * *earliest* title in the run, not the value from a moment ago.
       */
      oldTitle: string | null;
    };

/**
 * Decides whether a title change should extend the previous history entry or
 * start a new one.
 *
 * Extends only when the previous `title_changed` entry is:
 *   - authored by the same user (never merge two people's renames), and
 *   - inside the coalesce window.
 *
 * Anything else — a different user, an older entry, a missing/!malformed row —
 * starts a fresh entry, because losing an audit row is worse than showing two.
 */
export function decideTitleActivity(input: {
  previous: TitleActivityRow | null;
  currentUserId: string;
  now: Date;
  windowMs?: number;
}): TitleActivityDecision {
  const { previous, currentUserId, now } = input;
  const windowMs = input.windowMs ?? TITLE_ACTIVITY_COALESCE_WINDOW_MS;

  if (!previous) return { action: "insert" };
  if (previous.userId !== currentUserId) return { action: "insert" };

  const elapsed = now.getTime() - previous.createdAt.getTime();
  // A negative elapsed time means clock skew; treat it as outside the window
  // rather than silently merging into an entry that claims to be newer.
  if (elapsed < 0 || elapsed > windowMs) return { action: "insert" };

  const data = readTitleChangeEventData(previous.eventData);
  if (!data) return { action: "insert" };

  return {
    action: "update",
    activityId: previous.id,
    oldTitle: data.oldTitle,
  };
}
