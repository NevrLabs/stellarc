import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { boardTable, notificationTable, taskTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import { notificationSchema } from "../schemas";
import clearNotifications from "./controllers/clear-notifications";
import createNotification from "./controllers/create-notification";
import getNotifications from "./controllers/get-notifications";
import getUnreadNotificationCount from "./controllers/get-unread-notification-count";
import markAllNotificationsAsRead from "./controllers/mark-all-notifications-as-read";
import markAsRead from "./controllers/mark-notification-as-read";
import {
  getAssignmentNotificationRecipientIds,
  getTaskNotificationContext,
  getTaskNotificationRecipientIds,
} from "./task-notification-recipients";

type TaskChangeNotification = {
  taskId: string;
  userId: string;
  type: string;
  [key: string]: unknown;
};

async function notifyTaskParticipants(
  data: TaskChangeNotification,
  notificationType: string,
  eventData: Record<string, unknown>,
  directUserIds: Array<string | null | undefined> = [],
) {
  const context = await getTaskNotificationContext(data.taskId);
  if (!context) return;
  const recipients = await getTaskNotificationRecipientIds({
    taskId: data.taskId,
    actorId: data.userId,
    directUserIds,
  });

  await Promise.all(
    recipients.map((userId) =>
      createNotification({
        userId,
        type: notificationType,
        eventData: {
          taskTitle: context.title,
          taskNumber: context.number,
          boardId: context.boardId,
          organizationId: context.organizationId,
          ...eventData,
        },
        resourceId: data.taskId,
        resourceType: "task",
      }),
    ),
  );
}

const bulkResultSchema = v.object({
  success: v.boolean(),
  count: v.optional(v.number()),
});

const notification = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listNotifications",
      tags: ["Notifications"],
      description: "Get all notifications for the current user",
      responses: {
        200: {
          description: "List of notifications",
          content: {
            "application/json": {
              schema: resolver(v.array(notificationSchema)),
            },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const notifications = await getNotifications(userId);
      return c.json(notifications);
    },
  )
  .get(
    "/unread-count",
    describeRoute({
      operationId: "getUnreadNotificationCount",
      tags: ["Notifications"],
      description:
        "Get the complete unread notification count for the current user",
      responses: {
        200: {
          description: "Unread notification count",
          content: {
            "application/json": {
              schema: resolver(v.object({ count: v.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const count = await getUnreadNotificationCount(userId);
      return c.json({ count });
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createNotification",
      tags: ["Notifications"],
      description: "Create a new notification for a user",
      responses: {
        200: {
          description: "Notification created successfully",
          content: {
            "application/json": { schema: resolver(notificationSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        title: v.optional(v.nullable(v.string())),
        message: v.optional(v.nullable(v.string())),
        type: v.string(),
        eventData: v.optional(v.nullable(v.record(v.string(), v.unknown()))),
        relatedEntityId: v.optional(v.string()),
        relatedEntityType: v.optional(v.string()),
      }),
    ),
    async (c) => {
      const {
        title,
        message,
        type,
        eventData,
        relatedEntityId,
        relatedEntityType,
      } = c.req.valid("json");
      const userId = c.get("userId");
      const notification = await createNotification({
        userId,
        title,
        content: message,
        type,
        eventData,
        resourceId: relatedEntityId,
        resourceType: relatedEntityType,
      });
      return c.json(notification);
    },
  )
  .patch(
    "/:id/read",
    describeRoute({
      operationId: "markNotificationAsRead",
      tags: ["Notifications"],
      description: "Mark a specific notification as read",
      responses: {
        200: {
          description: "Notification marked as read",
          content: {
            "application/json": { schema: resolver(notificationSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const notification = await markAsRead(id, userId);
      return c.json(notification);
    },
  )
  .patch(
    "/read-all",
    describeRoute({
      operationId: "markAllNotificationsAsRead",
      tags: ["Notifications"],
      description: "Mark all notifications as read for the current user",
      responses: {
        200: {
          description: "All notifications marked as read",
          content: {
            "application/json": { schema: resolver(bulkResultSchema) },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const result = await markAllNotificationsAsRead(userId);
      return c.json(result);
    },
  )
  .delete(
    "/clear-all",
    describeRoute({
      operationId: "clearAllNotifications",
      tags: ["Notifications"],
      description: "Clear all notifications for the current user",
      responses: {
        200: {
          description: "All notifications cleared",
          content: {
            "application/json": { schema: resolver(bulkResultSchema) },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const result = await clearNotifications(userId);
      return c.json(result);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteNotification",
      tags: ["Notifications"],
      description: "Delete a single notification for the current user",
      responses: {
        200: {
          description: "Notification deleted",
          content: {
            "application/json": {
              schema: v.object({ success: v.boolean() }),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const userId = c.get("userId");
      const { id } = c.req.valid("param");
      await db
        .delete(notificationTable)
        .where(
          and(
            eq(notificationTable.id, id),
            eq(notificationTable.userId, userId),
          ),
        );
      return c.json({ success: true });
    },
  );

subscribeToEvent<{
  taskId: string;
  userId: string;
  currentUserId?: string;
  title: string;
  boardId: string;
}>("task.created", async (data) => {
  if (data.userId && data.userId !== data.currentUserId) {
    const [board] = await db
      .select({ organizationId: boardTable.organizationId })
      .from(boardTable)
      .where(eq(boardTable.id, data.boardId))
      .limit(1);

    await createNotification({
      userId: data.userId,
      type: "task_created",
      eventData: {
        taskTitle: data.title,
        boardId: data.boardId,
        organizationId: board?.organizationId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

subscribeToEvent<{
  organizationId: string;
  organizationName: string;
  ownerEmail: string;
  ownerId?: string;
}>("organization.created", async (data) => {
  if (data.ownerId) {
    await createNotification({
      userId: data.ownerId,
      type: "organization_created",
      eventData: {
        organizationName: data.organizationName,
      },
      resourceId: data.organizationId,
      resourceType: "organization",
    });
  }
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
  title: string;
  assigneeId?: string;
}>("task.status_changed", async (data) => {
  await notifyTaskParticipants(
    data,
    "task_status_changed",
    { oldStatus: data.oldStatus, newStatus: data.newStatus },
    [data.assigneeId],
  );
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldAssignee: string | null;
  newAssignee: string;
  newAssigneeId: string;
  title: string;
}>("task.assignee_changed", async (data) => {
  const context = await getTaskNotificationContext(data.taskId);
  if (!context) return;

  const recipients = getAssignmentNotificationRecipientIds({
    actorId: data.userId,
    newAssigneeId: data.newAssigneeId,
  });
  await Promise.all(
    recipients.map((userId) =>
      createNotification({
        userId,
        type: "task_assignee_changed",
        eventData: {
          taskTitle: context.title,
          taskNumber: context.number,
          boardId: context.boardId,
          organizationId: context.organizationId,
        },
        resourceId: data.taskId,
        resourceType: "task",
      }),
    ),
  );
});

subscribeToEvent<TaskChangeNotification>("task.title_changed", async (data) => {
  await notifyTaskParticipants(data, "task_title_changed", {
    oldTitle: data.oldTitle,
    newTitle: data.newTitle,
  });
});

subscribeToEvent<TaskChangeNotification>(
  "task.description_changed",
  async (data) => {
    await notifyTaskParticipants(data, "task_description_changed", {});
  },
);

subscribeToEvent<TaskChangeNotification>(
  "task.priority_changed",
  async (data) => {
    await notifyTaskParticipants(data, "task_priority_changed", {
      oldPriority: data.oldPriority,
      newPriority: data.newPriority,
    });
  },
);

subscribeToEvent<TaskChangeNotification>(
  "task.due_date_changed",
  async (data) => {
    await notifyTaskParticipants(data, "task_due_date_changed", {
      oldDueDate: data.oldDueDate,
      newDueDate: data.newDueDate,
    });
  },
);

subscribeToEvent<TaskChangeNotification>("task.flag_raised", async (data) => {
  await notifyTaskParticipants(
    data,
    "task_flag_raised",
    { flagTypeName: data.flagTypeName, note: data.note },
    [typeof data.targetUserId === "string" ? data.targetUserId : null],
  );
});

subscribeToEvent<TaskChangeNotification>("task.flag_resolved", async (data) => {
  await notifyTaskParticipants(data, "task_flag_resolved", {
    flagTypeName: data.flagTypeName,
    resolveNote: data.resolveNote,
  });
});

subscribeToEvent<TaskChangeNotification>("task.unassigned", async (data) => {
  await notifyTaskParticipants(data, "task_unassigned", {});
});

subscribeToEvent<TaskChangeNotification>("task.moved", async (data) => {
  await notifyTaskParticipants(data, "task_moved", {
    fromBoardName: data.fromBoardName ?? data.fromProjectName,
    toBoardName: data.toBoardName ?? data.toProjectName,
  });
});

for (const eventName of [
  "task.label_assigned",
  "task.label_unassigned",
] as const) {
  subscribeToEvent<TaskChangeNotification>(eventName, async (data) => {
    await notifyTaskParticipants(
      data,
      eventName === "task.label_assigned"
        ? "task_label_assigned"
        : "task_label_unassigned",
      {},
    );
  });
}

subscribeToEvent<{
  timeEntryId: string;
  taskId: string;
  userId: string;
  taskOwnerId?: string;
  taskTitle?: string;
}>("time-entry.created", async (data) => {
  if (data.taskOwnerId && data.taskOwnerId !== data.userId) {
    const [task] = await db
      .select({ boardId: taskTable.boardId })
      .from(taskTable)
      .where(eq(taskTable.id, data.taskId))
      .limit(1);

    const [board] = task
      ? await db
          .select({ organizationId: boardTable.organizationId })
          .from(boardTable)
          .where(eq(boardTable.id, task.boardId))
          .limit(1)
      : [];

    await createNotification({
      userId: data.taskOwnerId,
      type: "time_entry_created",
      eventData: {
        taskTitle: data.taskTitle ?? null,
        boardId: task?.boardId ?? null,
        organizationId: board?.organizationId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

export default notification;
