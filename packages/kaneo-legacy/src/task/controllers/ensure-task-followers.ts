import db from "../../database";
import { taskFollowerTable } from "../../database/schema";

/**
 * Persist one or more automatic follow relationships.
 *
 * This deliberately does not validate that the task exists: every caller runs
 * after the task has been loaded or created, and task_follower's foreign key is
 * the final integrity boundary. Keeping this as a single insert also makes a
 * multi-mention trigger one query rather than N task lookups + N inserts.
 */
export async function ensureTaskFollowers({
  taskId,
  userIds,
}: {
  taskId: string;
  userIds: Array<string | null | undefined>;
}) {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((id): id is string => Boolean(id))),
  );
  if (uniqueUserIds.length === 0) return;

  await db
    .insert(taskFollowerTable)
    .values(uniqueUserIds.map((userId) => ({ taskId, userId })))
    .onConflictDoNothing({
      target: [taskFollowerTable.taskId, taskFollowerTable.userId],
    });
}

export default ensureTaskFollowers;
