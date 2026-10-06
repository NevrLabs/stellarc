import { and, eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  clampSubtaskDepthLimit,
  exceedsSubtaskDepthLimit,
  subtaskDepthLimitMessage,
} from "./subtask-depth";

async function createTaskRelation({
  sourceTaskId,
  targetTaskId,
  relationType,
  userId,
  organizationId,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
  userId: string;
  organizationId: string;
}) {
  if (sourceTaskId === targetTaskId) {
    throw new HTTPException(400, {
      message: "Cannot create a relation between a task and itself",
    });
  }

  const [sourceTask] = await db
    .select({
      id: taskTable.id,
      boardId: taskTable.boardId,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      and(
        eq(taskTable.id, sourceTaskId),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!sourceTask) {
    throw new HTTPException(404, { message: "Source task not found" });
  }

  const [targetTask] = await db
    .select({
      id: taskTable.id,
      boardId: taskTable.boardId,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      and(
        eq(taskTable.id, targetTaskId),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!targetTask) {
    throw new HTTPException(404, { message: "Target task not found" });
  }

  const existing = await db
    .select({ id: taskRelationTable.id })
    .from(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.relationType, relationType),
        or(
          and(
            eq(taskRelationTable.sourceTaskId, sourceTaskId),
            eq(taskRelationTable.targetTaskId, targetTaskId),
          ),
          and(
            eq(taskRelationTable.sourceTaskId, targetTaskId),
            eq(taskRelationTable.targetTaskId, sourceTaskId),
          ),
        ),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: "This relation already exists",
    });
  }

  if (relationType === "subtask") {
    // Depth is a per-board setting (1..4). Walk the existing subtask graph for
    // the source's board and reject the link when the resulting chain would be
    // deeper than the board allows.
    const [board] = await db
      .select({ subtaskDepthLimit: boardTable.subtaskDepthLimit })
      .from(boardTable)
      .where(eq(boardTable.id, sourceTask.boardId))
      .limit(1);

    const depthLimit = clampSubtaskDepthLimit(board?.subtaskDepthLimit);

    const edges = await db
      .select({
        sourceTaskId: taskRelationTable.sourceTaskId,
        targetTaskId: taskRelationTable.targetTaskId,
      })
      .from(taskRelationTable)
      .where(eq(taskRelationTable.relationType, "subtask"));

    if (
      exceedsSubtaskDepthLimit({
        edges,
        sourceTaskId,
        targetTaskId,
        depthLimit,
      })
    ) {
      throw new HTTPException(400, {
        message: subtaskDepthLimitMessage(depthLimit),
      });
    }
  }

  const [relation] = await db
    .insert(taskRelationTable)
    .values({
      sourceTaskId,
      targetTaskId,
      relationType,
    })
    .returning();

  if (!relation) {
    throw new HTTPException(500, {
      message: "Failed to create task relation",
    });
  }

  await publishEvent("task-relation.created", {
    ...relation,
    taskId: sourceTaskId,
    boardId: sourceTask.boardId,
    userId,
  });

  return relation;
}

export default createTaskRelation;
