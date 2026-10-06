import { and, eq, inArray } from "drizzle-orm";
import db from "../database";
import {
  externalLinkTable,
  integrationTable,
  taskRepoItemLinkTable,
} from "../database/schema";
import { subscribeToEvent } from "../events";
import type {
  IntegrationPlugin,
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
} from "./types";

const plugins = new Map<string, IntegrationPlugin>();
let eventSubscriptionsInitialized = false;

export function registerPlugin(plugin: IntegrationPlugin): void {
  if (plugins.has(plugin.type)) {
    throw new Error(`Plugin ${plugin.type} already registered`);
  }
  plugins.set(plugin.type, plugin);
  console.log(`✓ Registered plugin: ${plugin.name}`);
}

export function initializeEventSubscriptions(): void {
  if (eventSubscriptionsInitialized) {
    return;
  }

  subscribeToEvent<{
    taskId: string;
    userId: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    number: number;
    boardId: string;
  }>("task.created", async (data) => {
    await broadcastTaskCreated({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: data.status,
      number: data.number,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    oldStatus: string;
    newStatus: string;
    title: string;
    boardId: string;
  }>("task.status_changed", async (data) => {
    await broadcastTaskStatusChanged({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      title: data.title,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    oldPriority: string;
    newPriority: string;
    title: string;
    boardId: string;
  }>("task.priority_changed", async (data) => {
    await broadcastTaskPriorityChanged({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      oldPriority: data.oldPriority,
      newPriority: data.newPriority,
      title: data.title,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    oldTitle: string;
    newTitle: string;
    boardId: string;
  }>("task.title_changed", async (data) => {
    await broadcastTaskTitleChanged({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      oldTitle: data.oldTitle,
      newTitle: data.newTitle,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    oldDescription: string | null;
    newDescription: string | null;
    boardId: string;
  }>("task.description_changed", async (data) => {
    await broadcastTaskDescriptionChanged({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      oldDescription: data.oldDescription,
      newDescription: data.newDescription,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string;
    comment: string;
    authorName?: string | null;
    boardId: string;
    externalSource?: string | null;
  }>("comment.created", async (data) => {
    if (data.externalSource) return;
    await broadcastTaskCommentCreated({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      comment: data.comment,
      authorName: data.authorName ?? null,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    title: string;
    boardId: string;
  }>("task.deleted", async (data) => {
    await broadcastTaskDeleted({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      title: data.title,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    fromBoardId: string;
    fromBoardName: string;
    toBoardId: string;
    toBoardName: string;
    oldStatus: string;
    newStatus: string;
  }>("task.moved", async (data) => {
    await broadcastTaskMoved({
      taskId: data.taskId,
      boardId: data.toBoardId,
      userId: data.userId,
      fromBoardId: data.fromBoardId,
      fromBoardName: data.fromBoardName,
      toBoardId: data.toBoardId,
      toBoardName: data.toBoardName,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    oldDueDate: Date | null;
    newDueDate: Date | null;
    title: string;
    boardId: string;
  }>("task.due_date_changed", async (data) => {
    await broadcastTaskDueDateChanged({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      title: data.title,
      oldDueDate: data.oldDueDate,
      newDueDate: data.newDueDate,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    oldAssignee: string | null;
    newAssignee: string | undefined;
    newAssigneeId: string;
    title: string;
    boardId: string;
  }>("task.assignee_changed", async (data) => {
    await broadcastTaskAssigneeChanged({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      title: data.title,
      oldAssignee: data.oldAssignee,
      newAssignee: data.newAssignee,
      newAssigneeId: data.newAssigneeId,
    });
  });

  subscribeToEvent<{
    taskId: string;
    userId: string | null;
    title: string;
    boardId: string;
  }>("task.unassigned", async (data) => {
    await broadcastTaskUnassigned({
      taskId: data.taskId,
      boardId: data.boardId,
      userId: data.userId,
      title: data.title,
    });
  });

  eventSubscriptionsInitialized = true;
  console.log("✓ Plugin event subscriptions initialized");
}

export function getPlugin(type: string): IntegrationPlugin | undefined {
  return plugins.get(type);
}

export function listPlugins(): IntegrationPlugin[] {
  return Array.from(plugins.values());
}

async function getActiveIntegrations(boardId: string) {
  return db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.boardId, boardId),
      eq(integrationTable.isActive, true),
    ),
    with: {
      board: true,
    },
  });
}

/**
 * Integrations that must hear about a change to this task.
 *
 * A task's own board is the obvious source, but a task can also *follow* a
 * GitHub issue that lives on a different board (task_repo_item_link with
 * sync_enabled). Scoping outbound sync to the task's board alone made those
 * followers one-way: they accepted inbound GitHub changes but never pushed
 * their own edits back, because the integration that owns the issue belongs to
 * another board.
 *
 * Followed integrations are discovered through the task's external_link rows,
 * which are what the outbound handlers look the issue number up in anyway.
 */
export async function resolveIntegrationsForTask(
  taskId: string,
  boardId: string,
) {
  const boardIntegrations = await getActiveIntegrations(boardId);

  const [follower] = await db
    .select({ id: taskRepoItemLinkTable.id })
    .from(taskRepoItemLinkTable)
    .where(
      and(
        eq(taskRepoItemLinkTable.taskId, taskId),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    )
    .limit(1);

  // Only followed tasks reach outside their own board.
  if (!follower) return boardIntegrations;

  const linkedIntegrationIds = await db
    .select({ integrationId: externalLinkTable.integrationId })
    .from(externalLinkTable)
    .where(eq(externalLinkTable.taskId, taskId));

  const seen = new Set(boardIntegrations.map((row) => row.id));
  const missing = linkedIntegrationIds
    .map((row) => row.integrationId)
    // #265: manual resource links have a null integrationId; the guard already
    // drops them, it just has to accept null as an input now.
    .filter((id): id is string => Boolean(id) && !seen.has(id as string));

  if (missing.length === 0) return boardIntegrations;

  const followedIntegrations = await db.query.integrationTable.findMany({
    where: and(
      inArray(integrationTable.id, missing),
      eq(integrationTable.isActive, true),
    ),
    with: {
      board: true,
    },
  });

  return [...boardIntegrations, ...followedIntegrations];
}

function createContext(integration: {
  id: string;
  boardId: string;
  config: string;
}): PluginContext {
  return {
    integrationId: integration.id,
    boardId: integration.boardId,
    config: JSON.parse(integration.config) as Record<string, unknown>,
  };
}

export async function broadcastTaskCreated(
  event: TaskCreatedEvent,
): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskCreated) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskCreated(event, context);
    } catch (error) {
      console.error(`Plugin ${plugin.type} error on task.created:`, error);
    }
  }
}

export async function broadcastTaskStatusChanged(
  event: TaskStatusChangedEvent,
): Promise<void> {
  const integrations = await resolveIntegrationsForTask(
    event.taskId,
    event.boardId,
  );

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskStatusChanged) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskStatusChanged(event, context);
    } catch (error) {
      console.error(
        `Plugin ${plugin.type} error on task.status_changed:`,
        error,
      );
    }
  }
}

export async function broadcastTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskPriorityChanged) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskPriorityChanged(event, context);
    } catch (error) {
      console.error(
        `Plugin ${plugin.type} error on task.priority_changed:`,
        error,
      );
    }
  }
}

export async function broadcastTaskTitleChanged(
  event: TaskTitleChangedEvent,
): Promise<void> {
  const integrations = await resolveIntegrationsForTask(
    event.taskId,
    event.boardId,
  );

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskTitleChanged) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskTitleChanged(event, context);
    } catch (error) {
      console.error(
        `Plugin ${plugin.type} error on task.title_changed:`,
        error,
      );
    }
  }
}

export async function broadcastTaskDescriptionChanged(
  event: TaskDescriptionChangedEvent,
): Promise<void> {
  const integrations = await resolveIntegrationsForTask(
    event.taskId,
    event.boardId,
  );

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskDescriptionChanged) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskDescriptionChanged(event, context);
    } catch (error) {
      console.error(
        `Plugin ${plugin.type} error on task.description_changed:`,
        error,
      );
    }
  }
}

export async function broadcastTaskCommentCreated(
  event: TaskCommentCreatedEvent,
): Promise<void> {
  const integrations = await resolveIntegrationsForTask(
    event.taskId,
    event.boardId,
  );

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskCommentCreated) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskCommentCreated(event, context);
    } catch (error) {
      console.error(`Plugin ${plugin.type} error on comment.created:`, error);
    }
  }
}

export async function broadcastTaskDeleted(
  event: TaskDeletedEvent,
): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskDeleted) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskDeleted(event, context);
    } catch (error) {
      console.error(`Plugin ${plugin.type} error on task.deleted:`, error);
    }
  }
}

export async function broadcastTaskMoved(event: TaskMovedEvent): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskMoved) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskMoved(event, context);
    } catch (error) {
      console.error(`Plugin ${plugin.type} error on task.moved:`, error);
    }
  }
}

export async function broadcastTaskDueDateChanged(
  event: TaskDueDateChangedEvent,
): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskDueDateChanged) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskDueDateChanged(event, context);
    } catch (error) {
      console.error(
        `Plugin ${plugin.type} error on task.due_date_changed:`,
        error,
      );
    }
  }
}

export async function broadcastTaskAssigneeChanged(
  event: TaskAssigneeChangedEvent,
): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskAssigneeChanged) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskAssigneeChanged(event, context);
    } catch (error) {
      console.error(
        `Plugin ${plugin.type} error on task.assignee_changed:`,
        error,
      );
    }
  }
}

export async function broadcastTaskUnassigned(
  event: TaskUnassignedEvent,
): Promise<void> {
  const integrations = await getActiveIntegrations(event.boardId);

  for (const integration of integrations) {
    const plugin = getPlugin(integration.type);
    if (!plugin?.onTaskUnassigned) continue;

    const context = createContext(integration);

    try {
      await plugin.onTaskUnassigned(event, context);
    } catch (error) {
      console.error(`Plugin ${plugin.type} error on task.unassigned:`, error);
    }
  }
}
