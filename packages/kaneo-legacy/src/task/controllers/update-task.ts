import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishProjectTicketUpdates } from "../../project/publish-project-ticket-updates";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import { assertValidTaskStatus } from "../validate-task-fields";

async function updateTask(
  id: string,
  title: string,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  boardId: string,
  description: string,
  priority: string,
  position: number,
  userId?: string,
  currentUserId?: string,
) {
  const [existingTask] = await db
    .select({
      id: taskTable.id,
      description: taskTable.description,
      status: taskTable.status,
      boardId: taskTable.boardId,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (boardId !== existingTask.boardId) {
    throw new HTTPException(400, {
      message: "Use the task move endpoint to move tasks between boards",
    });
  }

  await assertValidTaskStatus(status, boardId);

  const column = await db.query.columnTable.findFirst({
    where: and(eq(columnTable.boardId, boardId), eq(columnTable.slug, status)),
  });

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      title,
      status,
      columnId: column?.id ?? null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      boardId,
      description,
      priority,
      position,
      userId: userId || null,
    })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task",
    });
  }

  if (existingTask.status !== status) {
    await publishEvent("task.status_changed", {
      taskId: updatedTask.id,
      boardId: updatedTask.boardId,
      userId: currentUserId,
      oldStatus: existingTask.status,
      newStatus: status,
      title: updatedTask.title,
      assigneeId: updatedTask.userId,
      type: "status_changed",
    });

    await publishEvent("task-relation.refresh", {
      boardId: updatedTask.boardId,
      userId: currentUserId,
    });
  }

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    boardId: updatedTask.boardId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  await publishProjectTicketUpdates(updatedTask.id);

  if (existingTask.description !== description) {
    deleteOrphanedAssets(existingTask.description, description, {
      taskId: id,
    }).catch(() => {});
  }

  return updatedTask;
}

export default updateTask;
