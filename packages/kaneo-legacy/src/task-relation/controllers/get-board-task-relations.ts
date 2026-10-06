import { and, asc, eq, inArray, or } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { listAccessibleResourceIds } from "../../resource-access";

type Edge = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

/**
 * Keep an edge only when at least one endpoint is on this board, and give each
 * local task at most one foreign parent. Exported for tests — pure, no DB.
 */
export function selectBoardEdges<T extends Edge>(
  edges: T[],
  localIds: Set<string>,
): T[] {
  const claimedParent = new Set<string>();

  return edges.filter((edge) => {
    const sourceLocal = localIds.has(edge.sourceTaskId);
    const targetLocal = localIds.has(edge.targetTaskId);

    // Neither endpoint is ours: a foreign parent's other children. Not our board.
    if (!sourceLocal && !targetLocal) return false;
    if (sourceLocal && targetLocal) return true;

    // Foreign parent of a local task ("subtask" is source=parent → target=child).
    if (!sourceLocal && edge.relationType === "subtask") {
      if (claimedParent.has(edge.targetTaskId)) return false;
      claimedParent.add(edge.targetTaskId);
      return true;
    }

    // Local task pointing outward (cross-board child, or a blocks edge).
    return true;
  });
}

/**
 * Relations to draw on one board's timeline.
 *
 * An edge is kept only when at least one endpoint lives on this board, so a
 * foreign parent contributes itself — never its unrelated children on other
 * boards. Cross-board children of local tasks ARE kept (they are this board's
 * work spilling outward), and each local task keeps at most one foreign parent
 * so the timeline never sprouts a second ancestry column.
 */
async function getBoardTaskRelations(
  boardId: string,
  organizationId: string,
  userId: string,
) {
  const localTasks = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.boardId, boardId));

  if (localTasks.length === 0) {
    return { relations: [], foreignTasks: [] };
  }

  const localIds = new Set(localTasks.map((task) => task.id));
  const isLocal = (id: string) => localIds.has(id);

  const edges = await db
    .select({
      id: taskRelationTable.id,
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      relationType: taskRelationTable.relationType,
    })
    .from(taskRelationTable)
    .where(
      or(
        inArray(taskRelationTable.sourceTaskId, [...localIds]),
        inArray(taskRelationTable.targetTaskId, [...localIds]),
      ),
    )
    .orderBy(asc(taskRelationTable.createdAt));

  const kept = selectBoardEdges(edges, localIds);

  const foreignIds = [
    ...new Set(
      kept
        .flatMap((edge) => [edge.sourceTaskId, edge.targetTaskId])
        .filter((id) => !isLocal(id)),
    ),
  ];

  if (foreignIds.length === 0) {
    return { relations: kept, foreignTasks: [] };
  }

  const foreignRows = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      boardId: taskTable.boardId,
      boardName: boardTable.name,
      boardSlug: boardTable.slug,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      and(
        inArray(taskTable.id, foreignIds),
        eq(boardTable.organizationId, organizationId),
      ),
    );

  // A relation must never leak a task from a board the viewer cannot see.
  const visibleBoardIds = new Set(
    await listAccessibleResourceIds({
      organizationId,
      resourceType: "board",
      userId,
      resourceIds: [...new Set(foreignRows.map((row) => row.boardId))],
    }),
  );

  const foreignTasks = foreignRows.filter((row) =>
    visibleBoardIds.has(row.boardId),
  );
  const visibleForeignIds = new Set(foreignTasks.map((row) => row.id));

  return {
    relations: kept.filter(
      (edge) =>
        (isLocal(edge.sourceTaskId) ||
          visibleForeignIds.has(edge.sourceTaskId)) &&
        (isLocal(edge.targetTaskId) ||
          visibleForeignIds.has(edge.targetTaskId)),
    ),
    foreignTasks,
  };
}

export default getBoardTaskRelations;
