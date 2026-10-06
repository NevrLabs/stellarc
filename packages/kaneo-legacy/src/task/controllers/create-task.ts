import { and, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  columnTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { parseMentionIds } from "../../utils/parse-mentions";
import { assertValidTaskStatus } from "../validate-task-fields";
import { claimTaskNumber } from "./claim-task-numbers";
import ensureTaskFollowers from "./ensure-task-followers";
import { notifyDescriptionMentions } from "./notify-description-mentions";

async function createTask({
  boardId,
  currentUserId,
  userId,
  teamId,
  title,
  status,
  startDate,
  dueDate,
  description,
  priority,
}: {
  boardId: string;
  currentUserId: string;
  userId?: string;
  teamId?: string;
  title: string;
  status: string;
  startDate?: Date;
  dueDate?: Date;
  description?: string;
  priority?: string;
}) {
  const resolvedStatus = status || "to-do";
  const resolvedPriority = priority || "no-priority";

  await assertValidTaskStatus(resolvedStatus, boardId);

  // Resolve the board's default assignee when the caller didn't pass one.
  // An explicit userId or teamId always wins; only absent values inherit.
  let effectiveUserId = userId;
  let effectiveTeamId = teamId;
  if (!effectiveUserId && !effectiveTeamId) {
    const [board] = await db
      .select({
        defaultAssigneeId: boardTable.defaultAssigneeId,
        defaultAssigneeTeamId: boardTable.defaultAssigneeTeamId,
      })
      .from(boardTable)
      .where(eq(boardTable.id, boardId))
      .limit(1);
    effectiveUserId = board?.defaultAssigneeId ?? undefined;
    effectiveTeamId = board?.defaultAssigneeTeamId ?? undefined;
  }

  const [assignee] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, effectiveUserId ?? ""));

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.boardId, boardId),
      eq(columnTable.slug, resolvedStatus),
    ),
  });

  const [maxPositionResult] = await db
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.boardId, boardId),
        column?.id
          ? eq(taskTable.columnId, column.id)
          : eq(taskTable.status, resolvedStatus),
      ),
    );

  const nextPosition = (maxPositionResult?.maxPosition ?? 0) + 1;

  const createdTask = await db.transaction(async (tx) => {
    const taskNumber = await claimTaskNumber(boardId, tx);

    const [task] = await tx
      .insert(taskTable)
      .values({
        boardId,
        userId: effectiveUserId || null,
        teamId: effectiveTeamId || null,
        title: title || "",
        status: resolvedStatus,
        columnId: column?.id ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        description: description || "",
        priority: resolvedPriority,
        number: taskNumber,
        position: nextPosition,
      })
      .returning();

    return task;
  });

  if (!createdTask) {
    throw new HTTPException(500, {
      message: "Failed to create task",
    });
  }

  /*
    Mentioning someone while WRITING a new ticket previously notified nobody:
    this path never looked at the description, while editing that same
    description afterwards did. Same helper as the edit path so the two cannot
    drift again.
  */
  const mentionedIds = parseMentionIds(createdTask.description);
  await ensureTaskFollowers({
    taskId: createdTask.id,
    userIds: [currentUserId, effectiveUserId, ...mentionedIds],
  });
  if (mentionedIds.length > 0) {
    const [creator] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, currentUserId))
      .limit(1);
    const [taskBoard] = await db
      .select({ organizationId: boardTable.organizationId })
      .from(boardTable)
      .where(eq(boardTable.id, createdTask.boardId))
      .limit(1);

    await notifyDescriptionMentions({
      description: createdTask.description,
      actorId: currentUserId,
      taskId: createdTask.id,
      taskTitle: createdTask.title,
      actorName: creator?.name ?? null,
      boardId: createdTask.boardId,
      organizationId: taskBoard?.organizationId ?? null,
    });
  }

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    currentUserId: currentUserId,
    type: "created",
    content: null,
  });

  return {
    ...createdTask,
    assigneeName: assignee?.name,
  };
}

export default createTask;
