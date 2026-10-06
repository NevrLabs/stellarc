import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  repoIssueTable,
  repoTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { resolveTargetStatus } from "../../plugins/github/utils/resolve-column";

/**
 * #2: sync an issue's OPEN/CLOSED state onto every task that follows it.
 *
 * Kaneo has two independent link systems:
 *
 *  - `external_link` — created when a whole BOARD is synced to a repo. It
 *    carries an `integration_id`, and every GitHub webhook handler resolves
 *    work through it.
 *  - `task_repo_item_link` — created when a single task is linked to one issue
 *    ("Link GitHub resource"). It has NO integration_id, because the board it
 *    belongs to may have no repo sync at all.
 *
 * Only `handleIssueEdited` ever consulted the second table (via
 * syncFollowersForIssue, title/body only). Everything else — closing an issue
 * above all — walked `external_link` exclusively, so a task linked to an issue
 * on an unsynced board silently received nothing.
 *
 * This resolves followers by repo + issue number, independent of any
 * integration, and is safe to call alongside the external_link path: tasks
 * already updated there are skipped by `alreadyHandledTaskIds`.
 */
export async function syncFollowerStatusForIssue({
  owner,
  repo,
  issueNumber,
  eventType,
  fallbackStatus,
  alreadyHandledTaskIds = [],
}: {
  owner: string;
  repo: string;
  issueNumber: number;
  eventType: string;
  fallbackStatus: string;
  alreadyHandledTaskIds?: string[];
}) {
  const followers = await db
    .select({
      taskId: taskRepoItemLinkTable.taskId,
      boardId: taskTable.boardId,
      status: taskTable.status,
      title: taskTable.title,
      userId: taskTable.userId,
    })
    .from(taskRepoItemLinkTable)
    .innerJoin(
      repoIssueTable,
      eq(taskRepoItemLinkTable.repoIssueId, repoIssueTable.id),
    )
    .innerJoin(repoTable, eq(repoIssueTable.repoId, repoTable.id))
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .where(
      and(
        eq(repoTable.owner, owner),
        eq(repoTable.name, repo),
        eq(repoIssueTable.number, issueNumber),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    );

  const handled = new Set(alreadyHandledTaskIds);
  const updated: string[] = [];

  for (const follower of followers) {
    if (handled.has(follower.taskId)) continue;

    // Each follower can sit on a different board, so the target column has to
    // be resolved per board rather than once for the issue.
    const targetStatus = await resolveTargetStatus(
      follower.boardId,
      eventType,
      fallbackStatus,
    );

    if (follower.status === targetStatus) continue;

    const [after] = await db
      .update(taskTable)
      .set({ status: targetStatus })
      .where(eq(taskTable.id, follower.taskId))
      .returning();

    if (!after) continue;

    updated.push(follower.taskId);

    await publishEvent("task.status_changed", {
      taskId: after.id,
      boardId: after.boardId,
      userId: null,
      oldStatus: follower.status,
      newStatus: after.status,
      title: after.title,
      assigneeId: after.userId,
      type: "status_changed",
    });
  }

  return updated;
}

export default syncFollowerStatusForIssue;
