import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  milestoneTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import type { SubtaskEdge } from "../../task-relation/controllers/subtask-depth";

/**
 * Every task below `rootId` in the subtask graph, nearest-first, root excluded.
 *
 * `sourceTaskId` is the parent and `targetTaskId` the subtask, so we walk
 * source -> target. A visited set guards cycles: a corrupt graph (a -> b -> a)
 * terminates instead of hanging the request. Pure, no DB — exported for tests.
 */
export function collectSubtaskDescendants(
  edges: SubtaskEdge[],
  rootId: string,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    childrenOf.set(edge.sourceTaskId, [
      ...(childrenOf.get(edge.sourceTaskId) ?? []),
      edge.targetTaskId,
    ]);
  }

  const seen = new Set<string>([rootId]);
  const descendants: string[] = [];
  const queue = [rootId];

  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const child of childrenOf.get(node) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      descendants.push(child);
      queue.push(child);
    }
  }

  return descendants;
}

/**
 * The exact task ids a milestone assignment should write, root first.
 *
 * A milestone belongs to exactly one board, so a descendant living on another
 * board must NOT receive it — that would break the board invariant the rest of
 * this controller enforces. Descendants whose board is unknown are skipped for
 * the same reason. Pure, no DB — exported for tests.
 */
export function resolvePropagationTargets({
  edges,
  rootId,
  boardId,
  boardIdOf,
}: {
  edges: SubtaskEdge[];
  rootId: string;
  boardId: string;
  boardIdOf: Map<string, string>;
}): string[] {
  const sameBoard = collectSubtaskDescendants(edges, rootId).filter(
    (id) => boardIdOf.get(id) === boardId,
  );

  return [rootId, ...sameBoard];
}

/**
 * Assign (or clear, when milestoneId is null) a task's milestone.
 * A task may only reference a milestone that lives on the SAME board.
 *
 * The assignment propagates down the subtask subtree: every descendant on the
 * same board receives the same milestoneId, and clearing to null clears the
 * subtree too. Returns the updated root task row.
 */
async function assignMilestoneToTask(
  boardId: string,
  taskId: string,
  milestoneId: string | null,
) {
  const [task] = await db
    .select({ id: taskTable.id, boardId: taskTable.boardId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task || task.boardId !== boardId) {
    throw new HTTPException(404, { message: "Task not found on this board" });
  }

  if (milestoneId) {
    const [milestone] = await db
      .select({ id: milestoneTable.id, boardId: milestoneTable.boardId })
      .from(milestoneTable)
      .where(eq(milestoneTable.id, milestoneId))
      .limit(1);

    if (!milestone) {
      throw new HTTPException(404, { message: "Milestone not found" });
    }

    if (milestone.boardId !== task.boardId) {
      throw new HTTPException(400, {
        message: "Milestone does not belong to the task's board",
      });
    }
  }

  /**
   * Subtask edges are scoped to this board's tasks. Selecting every `subtask`
   * row in the database would grow with the whole instance, and cross-board
   * descendants are discarded below anyway.
   */
  const boardTaskIds = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.boardId, task.boardId));
  const boardTaskIdList = boardTaskIds.map((row) => row.id);

  const edges = boardTaskIdList.length
    ? await db
        .select({
          sourceTaskId: taskRelationTable.sourceTaskId,
          targetTaskId: taskRelationTable.targetTaskId,
        })
        .from(taskRelationTable)
        .where(
          and(
            eq(taskRelationTable.relationType, "subtask"),
            inArray(taskRelationTable.sourceTaskId, boardTaskIdList),
          ),
        )
    : [];

  const descendants = collectSubtaskDescendants(edges, taskId);

  const boardIdOf = new Map<string, string>();
  if (descendants.length > 0) {
    const rows = await db
      .select({ id: taskTable.id, boardId: taskTable.boardId })
      .from(taskTable)
      .where(inArray(taskTable.id, descendants));

    for (const row of rows) {
      boardIdOf.set(row.id, row.boardId);
    }
  }

  const targetIds = resolvePropagationTargets({
    edges,
    rootId: taskId,
    boardId: task.boardId,
    boardIdOf,
  });

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(taskTable)
      .set({ milestoneId })
      .where(inArray(taskTable.id, targetIds))
      .returning();

    return rows.find((row) => row.id === taskId);
  });

  if (!updated) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  return updated;
}

export default assignMilestoneToTask;
