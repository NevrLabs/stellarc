import { and, desc, eq, isNull, sql } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  columnTable,
  flagTypeTable,
  notificationTable,
  organizationTable,
  taskFlagTable,
  taskTable,
} from "../../database/schema";

async function getNotifications(userId: string) {
  // The task's newest UNRESOLVED flag drives the colour + label shown on flag
  // notifications. A task can carry several active flags; the most recent one
  // is the freshest signal, so it wins.
  const activeFlag = db
    .select({
      taskId: taskFlagTable.taskId,
      color: flagTypeTable.color,
      name: flagTypeTable.name,
      rn: sql<number>`row_number() over (
        partition by ${taskFlagTable.taskId}
        order by ${taskFlagTable.createdAt} desc
      )`.as("rn"),
    })
    .from(taskFlagTable)
    .innerJoin(flagTypeTable, eq(taskFlagTable.flagTypeId, flagTypeTable.id))
    .where(isNull(taskFlagTable.resolvedAt))
    .as("active_flag");

  const rows = await db
    .select({
      notification: notificationTable,
      boardId: boardTable.id,
      boardName: boardTable.name,
      organizationId: organizationTable.id,
      taskStatus: taskTable.status,
      taskStatusName: columnTable.name,
      taskStatusIcon: columnTable.icon,
      taskStatusIsFinal: columnTable.isFinal,
      flagColor: activeFlag.color,
      flagName: activeFlag.name,
    })
    .from(notificationTable)
    .leftJoin(
      taskTable,
      and(
        eq(notificationTable.resourceId, taskTable.id),
        eq(notificationTable.resourceType, "task"),
      ),
    )
    .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .leftJoin(columnTable, eq(taskTable.columnId, columnTable.id))
    .leftJoin(
      organizationTable,
      eq(boardTable.organizationId, organizationTable.id),
    )
    .leftJoin(
      activeFlag,
      and(eq(activeFlag.taskId, taskTable.id), eq(activeFlag.rn, 1)),
    )
    .where(eq(notificationTable.userId, userId))
    .orderBy(desc(notificationTable.createdAt))
    .limit(50);

  return rows.map(
    ({
      notification,
      boardId,
      boardName,
      organizationId,
      taskStatus,
      taskStatusName,
      taskStatusIcon,
      taskStatusIsFinal,
      flagColor,
      flagName,
    }) => {
      if (!boardId && !organizationId) {
        return notification;
      }

      const existing =
        notification.eventData &&
        typeof notification.eventData === "object" &&
        !Array.isArray(notification.eventData)
          ? (notification.eventData as Record<string, unknown>)
          : {};

      return {
        ...notification,
        eventData: {
          ...existing,
          boardId: boardId ?? existing.boardId ?? null,
          boardName: boardName ?? existing.boardName ?? null,
          organizationId: organizationId ?? existing.organizationId ?? null,
          // Current status of the ticket, resolved live at read time so the
          // inbox reflects moves that happened after the notification fired.
          taskStatus: taskStatus ?? existing.taskStatus ?? null,
          // Per-board display label; falls back to the raw slug when the task
          // has no column (e.g. Backlog) so the UI always has something to show.
          taskStatusName:
            taskStatusName ?? taskStatus ?? existing.taskStatusName ?? null,
          // Column icon + final flag let the inbox render the same status icon
          // the board uses, instead of a text label.
          taskStatusIcon: taskStatusIcon ?? existing.taskStatusIcon ?? null,
          taskStatusIsFinal:
            taskStatusIsFinal ?? existing.taskStatusIsFinal ?? false,
          // Flag colour + name for flag notifications. The subscriber only
          // stored flagTypeName (no colour), so both are resolved live from the
          // task's active flag — which also keeps them current if recoloured.
          flagTypeName: existing.flagTypeName ?? flagName ?? null,
          flagTypeColor: flagColor ?? existing.flagTypeColor ?? null,
        },
      };
    },
  );
}

export default getNotifications;
