import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  columnTable,
  integrationTable,
  organizationTable,
  taskTable,
  userTable,
} from "../../database/schema";
import type {
  PluginContext,
  TaskAssigneeChangedEvent,
  TaskCommentCreatedEvent,
  TaskCreatedEvent,
  TaskDeletedEvent,
  TaskDescriptionChangedEvent,
  TaskDueDateChangedEvent,
  TaskMovedEvent,
  TaskPriorityChangedEvent,
  TaskStatusChangedEvent,
  TaskTitleChangedEvent,
  TaskUnassignedEvent,
} from "../types";
import { postToGenericWebhook } from "./client";
import type { GenericWebhookConfig, GenericWebhookEventKey } from "./config";
import { normalizeGenericWebhookConfig } from "./config";

type GenericWebhookTaskData = {
  id: string;
  title: string;
  number: number | null;
  status: string | null;
  statusName: string | null;
  priority: string | null;
  boardId: string;
  boardName: string;
  organizationId: string;
  taskUrl: string;
};

function isEnabled(
  config: GenericWebhookConfig,
  key: GenericWebhookEventKey,
): boolean {
  return config.events?.[key] ?? false;
}

async function getTaskData(
  taskId: string,
  boardId: string,
): Promise<GenericWebhookTaskData | null> {
  const [taskRow] = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      columnName: columnTable.name,
      boardId: boardTable.id,
      boardName: boardTable.name,
      organizationId: organizationTable.id,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(
      organizationTable,
      eq(boardTable.organizationId, organizationTable.id),
    )
    .leftJoin(
      columnTable,
      and(
        eq(taskTable.columnId, columnTable.id),
        eq(columnTable.boardId, boardTable.id),
      ),
    )
    .where(and(eq(taskTable.id, taskId), eq(boardTable.id, boardId)))
    .limit(1);

  if (!taskRow) {
    return null;
  }

  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";

  return {
    ...taskRow,
    status: taskRow.status,
    statusName: taskRow.columnName ?? taskRow.status,
    taskUrl: `${clientUrl}/dashboard/organization/${taskRow.organizationId}/board/${taskRow.boardId}/task/${taskId}`,
  };
}

async function getActor(userId: string | null): Promise<{
  id: string | null;
  name: string | null;
}> {
  if (!userId) {
    return {
      id: null,
      name: null,
    };
  }

  const [user] = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return {
    id: user?.id ?? userId,
    name: user?.name ?? null,
  };
}

async function persistWebhookHealth(
  boardId: string,
  update: (config: GenericWebhookConfig) => GenericWebhookConfig,
): Promise<void> {
  try {
    const integration = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.boardId, boardId),
        eq(integrationTable.type, "generic-webhook"),
      ),
    });

    if (!integration) {
      return;
    }

    const currentConfig = normalizeGenericWebhookConfig(
      JSON.parse(integration.config) as GenericWebhookConfig,
    );

    await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(update(currentConfig)),
        updatedAt: new Date(),
      })
      .where(eq(integrationTable.id, integration.id));
  } catch (error) {
    console.error("persistWebhookHealth failed", {
      error,
      boardId,
    });
  }
}

async function deliverWebhookEvent(
  config: GenericWebhookConfig,
  eventName: string,
  taskId: string,
  boardId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const attempt = {
    eventName,
    taskId,
    boardId,
    webhookUrl: config.webhookUrl,
  };

  try {
    await postToGenericWebhook(config.webhookUrl, payload, config.secret);

    void persistWebhookHealth(boardId, (currentConfig) => ({
      ...currentConfig,
      health: {
        ...currentConfig.health,
        lastSuccessAt: new Date().toISOString(),
        lastFailureMessage: undefined,
        lastAttempt: attempt,
      },
    }));
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);

    void persistWebhookHealth(boardId, (currentConfig) => ({
      ...currentConfig,
      health: {
        ...currentConfig.health,
        lastFailureAt: new Date().toISOString(),
        lastFailureMessage: message,
        failureCount: (currentConfig.health?.failureCount ?? 0) + 1,
        lastAttempt: attempt,
      },
    }));

    console.error("postToGenericWebhook failed", {
      error,
      eventName,
      taskId,
      boardId,
      webhookUrl: config.webhookUrl,
    });
    return false;
  }
}

async function sendEvent(
  config: GenericWebhookConfig,
  eventName: string,
  taskId: string,
  boardId: string,
  userId: string | null,
  data: Record<string, unknown>,
): Promise<boolean> {
  const task = await getTaskData(taskId, boardId);
  if (!task) return false;

  const actor = await getActor(userId);

  return deliverWebhookEvent(config, eventName, taskId, boardId, {
    event: eventName,
    timestamp: new Date().toISOString(),
    integration: {
      type: "generic-webhook",
    },
    board: {
      id: task.boardId,
      name: task.boardName,
      organizationId: task.organizationId,
    },
    task: {
      id: task.id,
      number: task.number,
      title: task.title,
      status: task.status,
      statusName: task.statusName,
      priority: task.priority,
      url: task.taskUrl,
    },
    actor,
    data,
  });
}

export async function sendDueDateReminder(
  config: GenericWebhookConfig,
  taskId: string,
  boardId: string,
  leadTimeMinutes: number,
  dueDate: Date,
): Promise<boolean> {
  const normalizedConfig = normalizeGenericWebhookConfig(config);
  if (!isEnabled(normalizedConfig, "dueDateReminder")) return false;

  return sendEvent(
    normalizedConfig,
    "task.due_date_reminder",
    taskId,
    boardId,
    null,
    {
      dueDate: dueDate.toISOString(),
      leadTimeMinutes,
    },
  );
}

export async function handleTaskCreated(
  event: TaskCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskCreated")) return;

  await sendEvent(
    config,
    "task.created",
    event.taskId,
    event.boardId,
    event.userId,
    {
      title: event.title,
      description: event.description,
      priority: event.priority,
      status: event.status,
      number: event.number,
    },
  );
}

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskStatusChanged")) return;

  await sendEvent(
    config,
    "task.status_changed",
    event.taskId,
    event.boardId,
    event.userId,
    {
      title: event.title,
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
    },
  );
}

export async function handleTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskPriorityChanged")) return;

  await sendEvent(
    config,
    "task.priority_changed",
    event.taskId,
    event.boardId,
    event.userId,
    {
      title: event.title,
      oldPriority: event.oldPriority,
      newPriority: event.newPriority,
    },
  );
}

export async function handleTaskTitleChanged(
  event: TaskTitleChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskTitleChanged")) return;

  await sendEvent(
    config,
    "task.title_changed",
    event.taskId,
    event.boardId,
    event.userId,
    {
      oldTitle: event.oldTitle,
      newTitle: event.newTitle,
    },
  );
}

export async function handleTaskDescriptionChanged(
  event: TaskDescriptionChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskDescriptionChanged")) return;

  await sendEvent(
    config,
    "task.description_changed",
    event.taskId,
    event.boardId,
    event.userId,
    {
      oldDescription: event.oldDescription,
      newDescription: event.newDescription,
    },
  );
}

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskCommentCreated")) return;

  await sendEvent(
    config,
    "task.comment_created",
    event.taskId,
    event.boardId,
    event.userId,
    {
      comment: event.comment,
    },
  );
}

async function sendTaskDeletedEvent(
  config: GenericWebhookConfig,
  event: TaskDeletedEvent,
): Promise<boolean> {
  const [board] = await db
    .select({
      id: boardTable.id,
      name: boardTable.name,
      organizationId: boardTable.organizationId,
    })
    .from(boardTable)
    .where(eq(boardTable.id, event.boardId))
    .limit(1);

  if (!board) return false;

  const actor = await getActor(event.userId);

  return deliverWebhookEvent(
    config,
    "task.deleted",
    event.taskId,
    event.boardId,
    {
      event: "task.deleted",
      timestamp: new Date().toISOString(),
      integration: {
        type: "generic-webhook",
      },
      board: {
        id: board.id,
        name: board.name,
        organizationId: board.organizationId,
      },
      task: {
        id: event.taskId,
        title: event.title,
      },
      actor,
      data: {},
    },
  );
}

export async function handleTaskDeleted(
  event: TaskDeletedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskDeleted")) return;

  await sendTaskDeletedEvent(config, event);
}

export async function handleTaskMoved(
  event: TaskMovedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskMoved")) return;

  await sendEvent(
    config,
    "task.moved",
    event.taskId,
    event.boardId,
    event.userId,
    {
      fromBoardId: event.fromBoardId,
      fromBoardName: event.fromBoardName,
      toBoardId: event.toBoardId,
      toBoardName: event.toBoardName,
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
    },
  );
}

export async function handleTaskDueDateChanged(
  event: TaskDueDateChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskDueDateChanged")) return;

  await sendEvent(
    config,
    "task.due_date_changed",
    event.taskId,
    event.boardId,
    event.userId,
    {
      title: event.title,
      oldDueDate: event.oldDueDate,
      newDueDate: event.newDueDate,
    },
  );
}

export async function handleTaskAssigneeChanged(
  event: TaskAssigneeChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskAssigneeChanged")) return;

  await sendEvent(
    config,
    "task.assignee_changed",
    event.taskId,
    event.boardId,
    event.userId,
    {
      title: event.title,
      oldAssigneeId: event.oldAssignee ?? null,
      newAssigneeId: event.newAssigneeId,
      newAssignee: event.newAssignee ?? null,
    },
  );
}

export async function handleTaskUnassigned(
  event: TaskUnassignedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeGenericWebhookConfig(
    context.config as GenericWebhookConfig,
  );
  if (!isEnabled(config, "taskUnassigned")) return;

  await sendEvent(
    config,
    "task.unassigned",
    event.taskId,
    event.boardId,
    event.userId,
    {
      title: event.title,
    },
  );
}
