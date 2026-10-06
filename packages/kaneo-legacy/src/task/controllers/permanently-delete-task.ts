import { and, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getProjectTicketMemberships } from "../../project/publish-project-ticket-updates";
import { deleteS3Keys, getTaskAssetKeys } from "../../storage/cleanup-assets";

/**
 * Permanently removes a task that is already in the trash. This is a real DB
 * delete - FK cascades drop assets/labels/relations - so it is only allowed for
 * tasks whose `deletedAt` is set.
 */
async function permanentlyDeleteTask(taskId: string, currentUserId: string) {
  const assetKeys = await getTaskAssetKeys(taskId);
  // Capture before the hard delete: the task FK cascades membership rows.
  const memberships = await getProjectTicketMemberships(taskId);

  const [deletedTask] = await db
    .delete(taskTable)
    .where(and(eq(taskTable.id, taskId), isNotNull(taskTable.deletedAt)))
    .returning()
    .execute();

  if (!deletedTask) {
    throw new HTTPException(404, {
      message: "Trashed task not found",
    });
  }

  await publishEvent("task.permanently_deleted", {
    taskId: deletedTask.id,
    boardId: deletedTask.boardId,
    userId: currentUserId,
    title: deletedTask.title,
  });

  for (const membership of memberships) {
    await publishEvent("project.updated", {
      organizationId: membership.organizationId,
      projectId: membership.projectId,
    });
  }

  // Fire-and-forget S3 cleanup after successful DB delete
  if (assetKeys.length > 0) {
    deleteS3Keys(assetKeys).catch(() => {});
  }

  return deletedTask;
}

export default permanentlyDeleteTask;
