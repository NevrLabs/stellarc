export type DescriptionRevision = {
  content: string | null;
  editedAt: string;
  userId: string;
  /**
   * Set when the editor closed the task, which ends the compression window.
   * A sealed revision is never merged into, so a later edit always starts a new
   * entry even if it lands within the time window.
   */
  sealed?: boolean;
};

/** Consecutive edits inside this window collapse into one revision. */
export const DESCRIPTION_COMPRESSION_WINDOW_MS = 5 * 60_000;

/**
 * Append a pre-edit description snapshot to a task's history, compressing
 * rapid successive edits by the same author.
 *
 * History stores the content as it was *before* each edit, so when two edits
 * collapse the correct entry to keep is the OLDER one: it is the restore point
 * the user actually wants. Compression therefore drops the incoming snapshot
 * rather than overwriting the stored one.
 *
 * Compression stops when the author changes, when the gap exceeds the window,
 * or when the previous revision was sealed by the task being closed.
 */
export function appendDescriptionRevision(
  history: DescriptionRevision[],
  revision: DescriptionRevision,
  windowMs: number = DESCRIPTION_COMPRESSION_WINDOW_MS,
): DescriptionRevision[] {
  const previous = history.at(-1);
  if (!previous) return [...history, revision];

  const previousAt = Date.parse(previous.editedAt);
  const incomingAt = Date.parse(revision.editedAt);
  const withinWindow =
    Number.isFinite(previousAt) &&
    Number.isFinite(incomingAt) &&
    incomingAt - previousAt >= 0 &&
    incomingAt - previousAt <= windowMs;

  const compressible =
    withinWindow && previous.userId === revision.userId && !previous.sealed;

  // Keep the earlier snapshot: it is the further-back restore point.
  return compressible ? history : [...history, revision];
}

/**
 * Mark the newest revision as sealed so the next edit starts a fresh entry.
 * Called when the editor closes the task.
 */
export function sealDescriptionHistory(
  history: DescriptionRevision[],
  userId: string,
): DescriptionRevision[] {
  const previous = history.at(-1);
  if (!previous || previous.sealed || previous.userId !== userId) {
    return history;
  }
  return [...history.slice(0, -1), { ...previous, sealed: true }];
}
