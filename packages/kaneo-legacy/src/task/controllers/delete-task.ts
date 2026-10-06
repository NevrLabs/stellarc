import { and, eq, isNull, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishProjectTicketUpdates } from "../../project/publish-project-ticket-updates";
import getTask from "./get-task";

/**
 * Soft-deletes a task: stamps `deletedAt`/`deletedBy` so the task drops out of
 * every normal read path but stays recoverable from the recycle bin until it is
 * purged (see `purge-trashed-tasks`) or permanently deleted.
 */
async function deleteTask(taskId: string, currentUserId: string) {
  const task = await getTask(taskId);

  const relations = await db
    .select()
    .from(taskRelationTable)
    .where(
      or(
        eq(taskRelationTable.sourceTaskId, taskId),
        eq(taskRelationTable.targetTaskId, taskId),
      ),
    )
    .execute();

  const [deletedTask] = await db
    .update(taskTable)
    .set({ deletedAt: new Date(), deletedBy: currentUserId })
    .where(and(eq(taskTable.id, taskId), isNull(taskTable.deletedAt)))
    .returning()
    .execute();

  if (!deletedTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await publishEvent("task.deleted", {
    taskId: task.id,
    boardId: task.boardId,
    userId: currentUserId,
    title: task.title,
  });

  for (const relation of relations) {
    await publishEvent("task-relation.deleted", {
      boardId: task.boardId,
      userId: currentUserId,
      taskId: taskId,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
    });
  }

  await publishProjectTicketUpdates(taskId);

  return task;
}

export default deleteTask;
