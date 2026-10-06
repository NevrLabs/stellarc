import { and, desc, eq, isNotNull } from "drizzle-orm";
import db from "../../database";
import { boardTable, taskTable, userTable } from "../../database/schema";

type GetTrashedTasksOptions = {
  boardId?: string;
  organizationId?: string;
};

/**
 * Lists soft-deleted (trashed) tasks for a board or an organization.
 * Only rows with a non-null `deletedAt` are returned - the exact inverse of
 * every normal read path.
 */
async function getTrashedTasks(options: GetTrashedTasksOptions = {}) {
  const conditions = [isNotNull(taskTable.deletedAt)];

  if (options.boardId) {
    conditions.push(eq(taskTable.boardId, options.boardId));
  }

  if (options.organizationId) {
    conditions.push(eq(boardTable.organizationId, options.organizationId));
  }

  const rows = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      description: taskTable.description,
      status: taskTable.status,
      priority: taskTable.priority,
      position: taskTable.position,
      createdAt: taskTable.createdAt,
      boardId: taskTable.boardId,
      userId: taskTable.userId,
      deletedAt: taskTable.deletedAt,
      deletedBy: taskTable.deletedBy,
      deletedByName: userTable.name,
      boardName: boardTable.name,
    })
    .from(taskTable)
    .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .leftJoin(userTable, eq(taskTable.deletedBy, userTable.id))
    .where(and(...conditions))
    .orderBy(desc(taskTable.deletedAt));

  return rows;
}

export default getTrashedTasks;
