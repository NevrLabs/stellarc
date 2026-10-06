import createNotification from "../../notification/controllers/create-notification";
import { parseMentionIds } from "../../utils/parse-mentions";
import ensureTaskFollowers from "./ensure-task-followers";

type NotifyDescriptionMentionsInput = {
  description?: string | null;
  actorId: string;
  taskId: string;
  taskTitle?: string | null;
  actorName?: string | null;
  boardId?: string | null;
  organizationId?: string | null;
};

/**
 * Fire task_mention notifications for everyone @mentioned in a description.
 *
 * Extracted so the CREATE path can reuse the exact behaviour the edit path
 * already had. Mentioning someone while writing a new ticket previously
 * notified nobody — create-task never looked at the description — while
 * editing that same description afterwards worked. That split is invisible to
 * a user and made the feature look broken at the first moment they tried it.
 *
 * The author is always excluded: mentioning yourself must not ping you.
 */
export async function notifyDescriptionMentions({
  description,
  actorId,
  taskId,
  taskTitle,
  actorName,
  boardId,
  organizationId,
}: NotifyDescriptionMentionsInput): Promise<string[]> {
  const mentionedIds = parseMentionIds(description).filter(
    (id) => id !== actorId,
  );

  await ensureTaskFollowers({ taskId, userIds: mentionedIds });

  for (const mentionedId of mentionedIds) {
    await createNotification({
      userId: mentionedId,
      type: "task_mention",
      eventData: {
        taskTitle: taskTitle ?? null,
        mentionerName: actorName ?? null,
        boardId: boardId ?? null,
        organizationId: organizationId ?? null,
      },
      resourceId: taskId,
      resourceType: "task",
    });
  }

  return mentionedIds;
}

export default notifyDescriptionMentions;
