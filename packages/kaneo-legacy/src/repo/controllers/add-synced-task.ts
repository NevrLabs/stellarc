import { and, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  columnTable,
  repoIssueTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../database/schema";

export async function addSyncedTask({
  repoId,
  number,
  boardId,
  columnId,
  organizationId,
}: {
  repoId: string;
  number: number;
  boardId: string;
  columnId?: string;
  organizationId: string;
}) {
  const [issue] = await db
    .select()
    .from(repoIssueTable)
    .where(
      and(eq(repoIssueTable.repoId, repoId), eq(repoIssueTable.number, number)),
    )
    .limit(1);
  if (!issue) throw new HTTPException(404, { message: "Issue not found" });
  const [board] = await db
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(
      and(
        eq(boardTable.id, boardId),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!board) throw new HTTPException(404, { message: "Board not found" });
  const [existing] = await db
    .select({ taskId: taskTable.id })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .where(
      and(
        eq(taskRepoItemLinkTable.repoIssueId, issue.id),
        eq(taskRepoItemLinkTable.syncEnabled, true),
        eq(taskTable.boardId, boardId),
      ),
    )
    .limit(1);
  if (existing)
    throw new HTTPException(409, {
      message: `Board already follows this issue with task ${existing.taskId}`,
    });
  let column: typeof columnTable.$inferSelect | undefined;
  if (columnId) {
    column = await db.query.columnTable.findFirst({
      where: and(
        eq(columnTable.id, columnId),
        eq(columnTable.boardId, boardId),
      ),
    });
    if (!column)
      throw new HTTPException(404, {
        message: "Column not found on this board",
      });
  }
  const [maxResult] = await db
    .select({
      position: max(taskTable.position),
      number: max(taskTable.number),
    })
    .from(taskTable)
    .where(eq(taskTable.boardId, boardId));
  const [task] = await db
    .insert(taskTable)
    .values({
      boardId,
      columnId: column?.id ?? null,
      status: column?.slug ?? "to-do",
      title: issue.title,
      description: issue.body ?? "",
      position: (maxResult?.position ?? 0) + 1,
      number: (maxResult?.number ?? 0) + 1,
    })
    .returning();
  if (!task)
    throw new HTTPException(500, { message: "Failed to create synced task" });
  await db
    .insert(taskRepoItemLinkTable)
    .values({ taskId: task.id, repoIssueId: issue.id, syncEnabled: true });
  return task;
}

export async function unsyncTaskFromIssue({
  repoId,
  number,
  taskId,
  organizationId,
}: {
  repoId: string;
  number: number;
  taskId: string;
  organizationId: string;
}) {
  const [link] = await db
    .select({ id: taskRepoItemLinkTable.id })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(
      repoIssueTable,
      eq(taskRepoItemLinkTable.repoIssueId, repoIssueTable.id),
    )
    .where(
      and(
        eq(repoIssueTable.repoId, repoId),
        eq(repoIssueTable.number, number),
        eq(taskTable.id, taskId),
        eq(boardTable.organizationId, organizationId),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    )
    .limit(1);
  if (!link) throw new HTTPException(404, { message: "Synced task not found" });
  await db
    .update(taskRepoItemLinkTable)
    .set({ syncEnabled: false, syncBrokenAt: null, syncBrokenReason: null })
    .where(eq(taskRepoItemLinkTable.id, link.id));
  return link;
}
