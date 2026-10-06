import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskFollowerTable, taskTable } from "../../database/schema";

/**
 * KFL-339: follow / unfollow a ticket.
 *
 * Following is ORTHOGONAL to assignment and activity: it records an explicit,
 * durable interest so a user keeps receiving notifications for a ticket they
 * never commented on and are not assigned to. Unfollowing only removes the
 * explicit row — it can never strip someone from the assignee/participant
 * recipient sets, which are derived elsewhere.
 *
 * Idempotent on both sides: following twice is a no-op thanks to the
 * UNIQUE(task_id, user_id) constraint, and unfollowing when not following
 * succeeds silently. A double-clicked button must not 500.
 */
async function setTaskFollowing({
  taskId,
  userId,
  following,
}: {
  taskId: string;
  userId: string;
  following: boolean;
}) {
  const [task] = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (following) {
    await db
      .insert(taskFollowerTable)
      .values({ taskId, userId })
      .onConflictDoNothing({
        target: [taskFollowerTable.taskId, taskFollowerTable.userId],
      });
  } else {
    await db
      .delete(taskFollowerTable)
      .where(
        and(
          eq(taskFollowerTable.taskId, taskId),
          eq(taskFollowerTable.userId, userId),
        ),
      );
  }

  return { taskId, following };
}

export async function isFollowingTask({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  const [row] = await db
    .select({ id: taskFollowerTable.id })
    .from(taskFollowerTable)
    .where(
      and(
        eq(taskFollowerTable.taskId, taskId),
        eq(taskFollowerTable.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export default setTaskFollowing;
