import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { decideTitleActivity } from "../title-activity-coalesce";

async function updateTaskTitle({
  id,
  title,
  currentUserId,
}: {
  id: string;
  title: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (existingTask.title === title) return existingTask;

  // Audit history is not best-effort. Commit the title and its history row
  // atomically; event subscribers remain notifications/integrations only and
  // cannot make the audit trail disappear.
  const updatedTask = await db.transaction(async (tx) => {
    const [task] = await tx
      .update(taskTable)
      .set({ title })
      .where(eq(taskTable.id, id))
      .returning();

    if (!task) {
      throw new HTTPException(500, {
        message: "Failed to update task title",
      });
    }

    // #108: a rename typed over several seconds should read as one entry, not
    // one row per pause. Extend this user's most recent title change when it is
    // still inside the coalesce window.
    const [previous] = await tx
      .select({
        id: activityTable.id,
        userId: activityTable.userId,
        createdAt: activityTable.createdAt,
        eventData: activityTable.eventData,
      })
      .from(activityTable)
      .where(
        and(
          eq(activityTable.taskId, task.id),
          eq(activityTable.type, "title_changed"),
        ),
      )
      .orderBy(desc(activityTable.createdAt))
      .limit(1);

    const decision = decideTitleActivity({
      previous: previous ?? null,
      currentUserId,
      now: new Date(),
    });

    if (decision.action === "update") {
      await tx
        .update(activityTable)
        // Keep the run's original title as the starting point so the collapsed
        // entry reads "A → final", never "second-to-last → final".
        .set({ eventData: { oldTitle: decision.oldTitle, newTitle: title } })
        .where(eq(activityTable.id, decision.activityId));
    } else {
      await tx.insert(activityTable).values({
        taskId: task.id,
        type: "title_changed",
        userId: currentUserId,
        content: null,
        eventData: { oldTitle: existingTask.title, newTitle: title },
      });
    }

    return task;
  });

  await publishEvent("task.title_changed", {
    taskId: updatedTask.id,
    boardId: updatedTask.boardId,
    userId: currentUserId,
    oldTitle: existingTask.title,
    newTitle: title,
    type: "title_changed",
  });

  return updatedTask;
}

export default updateTaskTitle;
