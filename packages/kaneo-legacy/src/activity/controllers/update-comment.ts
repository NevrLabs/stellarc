import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";

async function updateComment(userId: string, id: string, content: string) {
  const [existing] = await db
    .select({
      id: activityTable.id,
      content: activityTable.content,
      editHistory: activityTable.editHistory,
      taskId: activityTable.taskId,
    })
    .from(activityTable)
    .where(
      and(
        eq(activityTable.id, id),
        eq(activityTable.userId, userId),
        eq(activityTable.type, "comment"),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, {
      message: "Comment not found or you are not the author",
    });
  }

  const [updated] = await db
    .update(activityTable)
    .set({
      content,
      editHistory:
        existing.content === content
          ? existing.editHistory
          : [
              ...existing.editHistory,
              {
                content: existing.content ?? "",
                editedAt: new Date().toISOString(),
                userId,
              },
            ],
    })
    .where(
      and(
        eq(activityTable.id, id),
        eq(activityTable.userId, userId),
        eq(activityTable.type, "comment"),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, {
      message: "Comment not found or you are not the author",
    });
  }

  const [task] = await db
    .select({ boardId: taskTable.boardId })
    .from(taskTable)
    .where(eq(taskTable.id, updated.taskId))
    .limit(1);

  if (task) {
    await publishEvent("comment.updated", {
      ...updated,
      boardId: task.boardId,
      userId,
    });
  }

  deleteOrphanedAssets(existing.content, content, {
    taskId: existing.taskId,
  }).catch(() => {});

  return updated;
}

export default updateComment;
