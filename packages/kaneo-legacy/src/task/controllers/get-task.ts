import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";

// The archiver is a second join against user, separate from the assignee join.
const archivedByUser = alias(userTable, "archived_by_user");

type GetTaskOptions = {
  /** Include soft-deleted (trashed) tasks. Only recycle-bin paths set this. */
  includeDeleted?: boolean;
};

async function getTask(taskId: string, options: GetTaskOptions = {}) {
  const task = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      description: taskTable.description,
      descriptionHistory: taskTable.descriptionHistory,
      status: taskTable.status,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      position: taskTable.position,
      createdAt: taskTable.createdAt,
      updatedAt: taskTable.updatedAt,
      // #226: callers need this to render Archive/Unarchive without inventing a
      // fake `status="archived"`. Archival is orthogonal to status.
      archivedAt: taskTable.archivedAt,
      archivedBy: taskTable.archivedBy,
      archivedByName: archivedByUser.name,
      userId: taskTable.userId,
      teamId: taskTable.teamId,
      milestoneId: taskTable.milestoneId,
      assigneeName: userTable.name,
      assigneeId: userTable.id,
      teamAssigneeName: teamTable.name,
      boardId: taskTable.boardId,
      // KFL-190: the detail view shows an "Archived" indicator when the
      // ticket's board itself is archived, which is distinct from the task's
      // own `archivedAt`.
      boardArchivedAt: boardTable.archivedAt,
      deletedAt: taskTable.deletedAt,
      deletedBy: taskTable.deletedBy,
    })
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
    .leftJoin(archivedByUser, eq(taskTable.archivedBy, archivedByUser.id))
    .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      options.includeDeleted
        ? eq(taskTable.id, taskId)
        : and(eq(taskTable.id, taskId), isNull(taskTable.deletedAt)),
    )
    .limit(1);

  if (!task.length || !task[0]) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  return task[0];
}

export default getTask;
