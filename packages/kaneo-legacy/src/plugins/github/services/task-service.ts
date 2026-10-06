import type { InferSelectModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import db from "../../../database";
import {
  columnTable,
  integrationTable,
  taskTable,
} from "../../../database/schema";
import {
  isClosedStatus,
  NON_COLUMN_STATUS_SLUGS,
} from "../../../task/status-taxonomy";

export type TaskRow = InferSelectModel<typeof taskTable>;

export type UpdateTaskStatusResult =
  | { applied: false }
  | { applied: true; before: TaskRow; after: TaskRow };

const NON_COLUMN_STATUSES = new Set(NON_COLUMN_STATUS_SLUGS);

export async function findTaskByNumber(boardId: string, taskNumber: number) {
  return db.query.taskTable.findFirst({
    where: and(
      eq(taskTable.boardId, boardId),
      eq(taskTable.number, taskNumber),
    ),
  });
}

export async function findTaskById(taskId: string) {
  return db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: string,
): Promise<UpdateTaskStatusResult> {
  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!task) {
    return { applied: false };
  }

  let columnId: string | null = null;

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.boardId, task.boardId),
      eq(columnTable.slug, newStatus),
    ),
  });

  if (column) {
    columnId = column.id;
  } else if (!NON_COLUMN_STATUSES.has(newStatus)) {
    console.warn(
      `[GitHub] Skipping status update for task ${taskId}: column "${newStatus}" not found in board ${task.boardId}`,
    );
    return { applied: false };
  }

  await db
    .update(taskTable)
    .set({ status: newStatus, columnId })
    .where(eq(taskTable.id, taskId));

  const after = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!after) {
    return { applied: false };
  }

  return { applied: true, before: task, after };
}

export async function isTaskInFinalState(task: {
  boardId: string;
  status: string;
  columnId: string | null;
  archivedAt?: Date | null;
}): Promise<boolean> {
  // #226: archived work is hidden and must not be silently moved by provider
  // automation while archived. Its retained status remains untouched.
  if (task.archivedAt) return true;
  if (task.columnId) {
    const columnById = await db.query.columnTable.findFirst({
      where: and(
        eq(columnTable.id, task.columnId),
        eq(columnTable.boardId, task.boardId),
      ),
    });

    if (columnById) {
      return columnById.isFinal;
    }
  }

  const columnByStatus = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.boardId, task.boardId),
      eq(columnTable.slug, task.status),
    ),
  });

  if (columnByStatus) {
    return columnByStatus.isFinal;
  }

  return isClosedStatus(task.status);
}

export async function getIntegrationWithBoard(integrationId: string) {
  return db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
    with: {
      board: true,
    },
  });
}

export async function findIntegrationByRepo(owner: string, repo: string) {
  const integrations = await findAllIntegrationsByRepo(owner, repo);
  return integrations[0] || null;
}

export async function findAllIntegrationsByRepo(owner: string, repo: string) {
  const integrations = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.type, "github"),
      eq(integrationTable.isActive, true),
    ),
    with: {
      board: true,
    },
  });

  return integrations.filter((integration) => {
    try {
      const config = JSON.parse(integration.config);
      return config.repositoryOwner === owner && config.repositoryName === repo;
    } catch {
      return false;
    }
  });
}
