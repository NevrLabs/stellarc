import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  columnTable,
  labelTable,
  organizationMemberTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  assertValidPriority,
  assertValidTaskStatus,
} from "../validate-task-fields";

type BulkOperation =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "updateTeam"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateDueDate"
  /**
   * #226: archival is orthogonal to status, so bulk archive CANNOT be expressed
   * as `updateStatus: "archived"` — `"archived"` is not a valid status and would
   * be rejected by `assertValidTaskStatus`. These write `archived_at` only.
   */
  | "archive"
  | "unarchive";

async function bulkUpdateTasks({
  taskIds,
  operation,
  value,
  userId,
}: {
  taskIds: string[];
  operation: BulkOperation;
  value?: string | null;
  userId: string;
}) {
  const tasks = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      boardId: taskTable.boardId,
      userId: taskTable.userId,
      dueDate: taskTable.dueDate,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(inArray(taskTable.id, taskIds));

  if (tasks.length === 0) {
    throw new HTTPException(404, {
      message: "No tasks found",
    });
  }

  const organizationIds = [...new Set(tasks.map((t) => t.organizationId))];

  if (organizationIds.length > 1) {
    throw new HTTPException(400, {
      message: "All tasks must belong to the same organization",
    });
  }

  const organizationId = organizationIds[0];

  if (!organizationId) {
    throw new HTTPException(400, {
      message: "Could not determine organization",
    });
  }

  const [membership] = await db
    .select({ id: organizationMemberTable.id })
    .from(organizationMemberTable)
    .where(
      and(
        eq(organizationMemberTable.userId, userId),
        eq(organizationMemberTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new HTTPException(403, {
      message: "You don't have access to this organization",
    });
  }

  const foundIds = tasks.map((t) => t.id);
  let updatedCount = 0;

  switch (operation) {
    case "updateStatus": {
      if (!value) {
        throw new HTTPException(400, { message: "Status value is required" });
      }
      const boardIds = [...new Set(tasks.map((t) => t.boardId))];

      for (const boardId of boardIds) {
        await assertValidTaskStatus(value, boardId);

        const column = await db.query.columnTable.findFirst({
          where: and(
            eq(columnTable.boardId, boardId),
            eq(columnTable.slug, value),
          ),
        });

        const boardTaskIds = tasks
          .filter((t) => t.boardId === boardId)
          .map((t) => t.id);

        const result = await db
          .update(taskTable)
          .set({ status: value, columnId: column?.id ?? null })
          .where(inArray(taskTable.id, boardTaskIds));

        updatedCount += result.rowCount ?? boardTaskIds.length;

        for (const taskId of boardTaskIds) {
          await publishEvent("task.status_changed", {
            taskId,
            boardId,
            userId,
            newStatus: value,
            type: "status_changed",
          });
        }

        await publishEvent("task-relation.refresh", {
          boardId,
          userId,
        });
      }
      break;
    }

    case "updatePriority": {
      if (!value) {
        throw new HTTPException(400, { message: "Priority value is required" });
      }
      assertValidPriority(value);

      const result = await db
        .update(taskTable)
        .set({ priority: value })
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        await publishEvent("task.priority_changed", {
          taskId: task.id,
          boardId: task.boardId,
          userId,
          newPriority: value,
          type: "priority_changed",
        });
      }
      break;
    }

    case "updateAssignee": {
      const newAssigneeName = value
        ? (
            await db
              .select({ name: userTable.name })
              .from(userTable)
              .where(eq(userTable.id, value))
              .limit(1)
          )[0]?.name
        : undefined;

      const result = await db
        .update(taskTable)
        .set({ userId: value || null })
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        const eventType = value ? "task.assignee_changed" : "task.unassigned";
        await publishEvent(eventType, {
          taskId: task.id,
          boardId: task.boardId,
          userId,
          oldAssignee: task.userId,
          newAssignee: newAssigneeName,
          newAssigneeId: value || null,
          title: task.title,
          type: value ? "assignee_changed" : "unassigned",
        });
      }
      break;
    }

    case "updateTeam": {
      const result = await db
        .update(taskTable)
        .set({ teamId: value || null })
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;
      break;
    }

    case "delete": {
      const result = await db
        .delete(taskTable)
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        await publishEvent("task.deleted", {
          taskId: task.id,
          boardId: task.boardId,
          userId,
          title: task.title,
        });
      }
      break;
    }

    case "addLabel": {
      if (!value) {
        throw new HTTPException(400, { message: "Label ID is required" });
      }

      const label = await db.query.labelTable.findFirst({
        where: eq(labelTable.id, value),
      });

      if (!label) {
        throw new HTTPException(404, { message: "Label not found" });
      }

      for (const task of tasks) {
        const existingAssignment = await db.query.labelTable.findFirst({
          where: and(
            eq(labelTable.name, label.name),
            eq(labelTable.taskId, task.id),
          ),
        });

        if (!existingAssignment) {
          await db
            .insert(labelTable)
            .values({
              name: label.name,
              color: label.color,
              organizationId: organizationId,
              taskId: task.id,
            })
            .onConflictDoNothing({
              target: [labelTable.taskId, labelTable.name],
            });
          updatedCount++;

          await publishEvent("task.label_assigned", {
            boardId: task.boardId,
            taskId: task.id,
            userId,
            type: "label_assigned",
          });
        }
      }
      break;
    }

    case "removeLabel": {
      if (!value) {
        throw new HTTPException(400, { message: "Label ID is required" });
      }
      const result = await db
        .update(labelTable)
        .set({ taskId: null })
        .where(
          and(eq(labelTable.id, value), inArray(labelTable.taskId, foundIds)),
        );

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        await publishEvent("task.label_unassigned", {
          boardId: task.boardId,
          taskId: task.id,
          userId,
          type: "label_unassigned",
        });
      }
      break;
    }

    case "updateDueDate": {
      let parsedDate: Date | null = null;
      if (value) {
        parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
          throw new HTTPException(400, {
            message: `Invalid date value "${value}"`,
          });
        }
      }

      const result = await db
        .update(taskTable)
        .set({ dueDate: parsedDate })
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        await publishEvent("task.due_date_changed", {
          taskId: task.id,
          boardId: task.boardId,
          userId,
          oldDueDate: task.dueDate,
          newDueDate: parsedDate,
          title: task.title,
          type: "due_date_changed",
        });
      }
      break;
    }

    case "archive":
    case "unarchive": {
      const archived = operation === "archive";

      /*
        Only `archived_at` moves. Status is deliberately untouched so an
        archived In Progress ticket is still In Progress when restored.

        Idempotent in the same spirit as `set-task-archived`: rows already in
        the desired state are skipped so re-archiving does not reset the
        original timestamp and disturb backlog ordering.
      */
      const result = await db
        .update(taskTable)
        .set({ archivedAt: archived ? new Date() : null })
        .where(
          and(
            inArray(taskTable.id, foundIds),
            archived
              ? isNull(taskTable.archivedAt)
              : isNotNull(taskTable.archivedAt),
          ),
        );

      updatedCount = result.rowCount ?? 0;

      /*
        NOT `task.status_changed` — the workflow state did not move, and
        emitting that would corrupt the activity trail.
      */
      for (const boardId of new Set(tasks.map((t) => t.boardId))) {
        await publishEvent("task-relation.refresh", { boardId, userId });
      }
      break;
    }

    default: {
      throw new HTTPException(400, {
        message: `Unknown operation "${operation}"`,
      });
    }
  }

  return { success: true, updatedCount };
}

export default bulkUpdateTasks;
