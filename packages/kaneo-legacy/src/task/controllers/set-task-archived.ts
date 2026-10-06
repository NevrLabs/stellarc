import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishProjectTicketUpdates } from "../../project/publish-project-ticket-updates";

/**
 * #226: archive / unarchive a task.
 *
 * Archival is ORTHOGONAL to status. From the ticket correction:
 *
 *   "Archive is a separate status to hide it from all views. Archived item
 *    retains its status."
 *
 * So this only ever writes `archivedAt` and NEVER touches `status`. Unarchiving
 * therefore needs no stored "previous status" — the status was never disturbed,
 * so the task simply reappears wherever it already belonged.
 */
async function setTaskArchived({
  id,
  archived,
  currentUserId,
}: {
  id: string;
  archived: boolean;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const alreadyInDesiredState = (existingTask.archivedAt != null) === archived;

  // Idempotent: re-archiving must not move the original archive timestamp, so
  // the backlog's ordering stays stable when a client retries.
  if (alreadyInDesiredState) {
    return existingTask;
  }

  const now = new Date();
  const [updatedTask] = await db
    .update(taskTable)
    .set(
      archived
        ? { archivedAt: now, archivedBy: currentUserId }
        : { archivedAt: null, archivedBy: null },
    )
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: `Failed to ${archived ? "archive" : "unarchive"} task`,
    });
  }

  /*
    Status is unchanged, so this is deliberately NOT `task.status_changed` —
    emitting that would tell every listener the workflow state moved when it
    did not, and would corrupt the activity trail.
  */
  await publishEvent("task-relation.refresh", {
    boardId: updatedTask.boardId,
    userId: currentUserId,
  });

  await publishProjectTicketUpdates(updatedTask.id);

  return updatedTask;
}

export default setTaskArchived;
