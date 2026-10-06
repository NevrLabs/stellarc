import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import createNotification from "../../notification/controllers/create-notification";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import { parseMentionIds } from "../../utils/parse-mentions";
import { appendDescriptionRevision } from "../utils/description-history";
import ensureTaskFollowers from "./ensure-task-followers";

async function updateTaskDescription({
  id,
  description,
  currentUserId,
}: {
  id: string;
  description: string;
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

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      description,
      descriptionHistory:
        existingTask.description === description
          ? existingTask.descriptionHistory
          : appendDescriptionRevision(existingTask.descriptionHistory, {
              content: existingTask.description,
              editedAt: new Date().toISOString(),
              userId: currentUserId,
            }),
    })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task description",
    });
  }

  await publishEvent("task.description_changed", {
    taskId: updatedTask.id,
    boardId: updatedTask.boardId,
    userId: currentUserId,
    oldDescription: existingTask.description,
    newDescription: description,
    type: "description_changed",
  });

  deleteOrphanedAssets(existingTask.description, description, {
    taskId: id,
  }).catch(() => {});

  // Notify members newly @mentioned by this edit (skip ones already mentioned
  // in the previous description, and the editor themselves).
  const alreadyMentioned = new Set(parseMentionIds(existingTask.description));
  const newlyMentioned = parseMentionIds(description).filter(
    (mentionedId) =>
      mentionedId !== currentUserId && !alreadyMentioned.has(mentionedId),
  );

  if (newlyMentioned.length > 0) {
    await ensureTaskFollowers({
      taskId: updatedTask.id,
      userIds: newlyMentioned,
    });
    const [editor] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, currentUserId));

    for (const mentionedId of newlyMentioned) {
      await createNotification({
        userId: mentionedId,
        type: "task_mention",
        eventData: {
          taskTitle: updatedTask.title,
          mentionerName: editor?.name ?? null,
        },
        resourceId: updatedTask.id,
        resourceType: "task",
      });
    }
  }

  return updatedTask;
}

export default updateTaskDescription;
