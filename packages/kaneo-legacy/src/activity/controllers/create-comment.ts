import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  boardTable,
  externalLinkTable,
  repoIssueTable,
  repoTable,
  taskRepoItemLinkTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import createNotification from "../../notification/controllers/create-notification";
import { getTaskNotificationRecipientIds } from "../../notification/task-notification-recipients";
import { createGitHubItemComment } from "../../repo/controllers/manage-github-repo";
import ensureTaskFollowers from "../../task/controllers/ensure-task-followers";
import { parseMentionIds } from "../../utils/parse-mentions";

async function createComment(taskId: string, userId: string, content: string) {
  const [activity] = await db
    .insert(activityTable)
    .values({
      taskId,
      type: "comment",
      userId,
      content,
    })
    .returning();

  if (!activity) {
    throw new HTTPException(500, {
      message: "Failed to create activity",
    });
  }

  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));

  const [task] = await db
    .select({
      assigneeId: taskTable.userId,
      boardId: taskTable.boardId,
      title: taskTable.title,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(eq(taskTable.id, taskId));

  if (task) {
    await publishEvent("comment.created", {
      ...activity,
      comment: content,
      authorName: user?.name ?? null,
      boardId: task.boardId,
    });
  }

  const [syncedIssue] = await db
    .select({ repoId: repoTable.id, number: repoIssueTable.number })
    .from(taskRepoItemLinkTable)
    .innerJoin(
      repoIssueTable,
      eq(taskRepoItemLinkTable.repoIssueId, repoIssueTable.id),
    )
    .innerJoin(repoTable, eq(repoIssueTable.repoId, repoTable.id))
    .where(
      and(
        eq(taskRepoItemLinkTable.taskId, taskId),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    )
    .limit(1);
  const [integrationLink] = await db
    .select({ id: externalLinkTable.id })
    .from(externalLinkTable)
    .where(
      and(
        eq(externalLinkTable.taskId, taskId),
        eq(externalLinkTable.resourceType, "issue"),
      ),
    )
    .limit(1);
  if (syncedIssue && !integrationLink) {
    await createGitHubItemComment({
      repoId: syncedIssue.repoId,
      number: syncedIssue.number,
      body: content,
      userId,
    });
  }

  // Notify any organization members @mentioned in the comment (not the author).
  const mentionedIds = parseMentionIds(content).filter((id) => id !== userId);
  await ensureTaskFollowers({
    taskId,
    userIds: [userId, ...mentionedIds],
  });
  for (const mentionedId of mentionedIds) {
    await createNotification({
      userId: mentionedId,
      type: "task_mention",
      eventData: {
        taskTitle: task?.title ?? null,
        mentionerName: user?.name ?? null,
        boardId: task?.boardId ?? null,
        organizationId: task?.organizationId ?? null,
      },
      resourceId: taskId,
      resourceType: "task",
    });
  }

  if (task) {
    const recipients = await getTaskNotificationRecipientIds({
      taskId,
      actorId: userId,
      directUserIds: [task.assigneeId],
    });
    const commentRecipients = recipients.filter(
      (recipientId) => !mentionedIds.includes(recipientId),
    );
    await Promise.all(
      commentRecipients.map((recipientId) =>
        createNotification({
          userId: recipientId,
          type: "task_comment",
          eventData: {
            taskTitle: task.title,
            commenterName: user?.name ?? null,
            commentPreview: content.slice(0, 160),
            boardId: task.boardId,
            organizationId: task.organizationId,
          },
          resourceId: taskId,
          resourceType: "task",
        }),
      ),
    );
  }

  return activity;
}

export default createComment;
