import { and, eq, ne } from "drizzle-orm";
import db from "../database";
import {
  activityTable,
  boardTable,
  organizationMemberTable,
  taskFollowerTable,
  taskTable,
} from "../database/schema";

/**
 * Users with a durable relationship to a ticket. Creation is canonicalized in
 * activity rather than duplicated in the task row; this intentionally matches
 * the "created" relation in My Tasks.
 */
export async function getTaskNotificationRecipientIds({
  taskId,
  actorId,
  directUserIds = [],
}: {
  taskId: string;
  actorId: string;
  directUserIds?: Array<string | null | undefined>;
}) {
  const [taskRows, activityUsers, followerRows] = await Promise.all([
    db
      .select({ assigneeId: taskTable.userId })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1),
    db
      .selectDistinct({ userId: activityTable.userId })
      .from(activityTable)
      .innerJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .innerJoin(
        organizationMemberTable,
        and(
          eq(organizationMemberTable.organizationId, boardTable.organizationId),
          eq(organizationMemberTable.userId, activityTable.userId),
        ),
      )
      .where(
        and(
          eq(activityTable.taskId, taskId),
          ne(activityTable.userId, actorId),
        ),
      ),
    // KFL-339: explicit followers. Gated on org membership for the same reason
    // participants are — a user who lost access must stop receiving mail even
    // if their follow row survives.
    db
      .selectDistinct({ userId: taskFollowerTable.userId })
      .from(taskFollowerTable)
      .innerJoin(taskTable, eq(taskFollowerTable.taskId, taskTable.id))
      .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .innerJoin(
        organizationMemberTable,
        and(
          eq(organizationMemberTable.organizationId, boardTable.organizationId),
          eq(organizationMemberTable.userId, taskFollowerTable.userId),
        ),
      )
      .where(eq(taskFollowerTable.taskId, taskId)),
  ]);

  const task = taskRows[0];
  return mergeTaskNotificationRecipientIds({
    actorId,
    assigneeId: task?.assigneeId,
    participantIds: activityUsers.map((row) => row.userId),
    followerIds: followerRows.map((row) => row.userId),
    directUserIds,
  });
}

export function getAssignmentNotificationRecipientIds({
  actorId,
  newAssigneeId,
}: {
  actorId: string;
  newAssigneeId?: string | null;
}) {
  return newAssigneeId && newAssigneeId !== actorId ? [newAssigneeId] : [];
}

export function mergeTaskNotificationRecipientIds({
  actorId,
  assigneeId,
  participantIds,
  directUserIds,
  followerIds = [],
}: {
  actorId: string;
  assigneeId?: string | null;
  participantIds: Array<string | null | undefined>;
  directUserIds: Array<string | null | undefined>;
  /**
   * KFL-339: users who explicitly follow the ticket. A follower has a durable
   * interest even when they never commented and are not the assignee, so they
   * are merged alongside participants rather than derived from activity.
   */
  followerIds?: Array<string | null | undefined>;
}) {
  const recipients = new Set<string>(
    [...participantIds, ...directUserIds, ...followerIds, assigneeId].filter(
      (id): id is string => Boolean(id),
    ),
  );
  recipients.delete(actorId);
  return Array.from(recipients);
}

export async function getTaskNotificationContext(taskId: string) {
  const [task] = await db
    .select({
      title: taskTable.title,
      number: taskTable.number,
      boardId: taskTable.boardId,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  return task ?? null;
}
