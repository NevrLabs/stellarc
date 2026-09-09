import type { TaskOrderUpdate } from "@/lib/reorder-board-task";
import {
  getProjection,
  getSubtreeIds,
  maxDepthForBoardLimit,
  wouldCreateCycle,
} from "@/lib/task-nesting-projection";
import type { BoardWithTasks } from "@/types/board";

export type GanttDndRow = {
  id: string;
  depth: number;
  parentId: string | null;
  isForeign?: boolean;
};

type SubtaskRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

export type GanttDropPlan = {
  orderedIds: string[];
  parentId: string | null;
  /** Depth the row will land at, for the live indent preview. */
  depth: number;
  /** Intent-box state to feed into the next move event. */
  dragDepth: number;
  deleteRelationId: string | null;
  createRelation: {
    sourceTaskId: string;
    targetTaskId: string;
    relationType: "subtask";
  } | null;
};

/** Remove descendants only from collision/projection candidates. */
export function removeChildrenOf(rows: GanttDndRow[], activeId: string) {
  const descendants = new Set(getSubtreeIds(rows, activeId).slice(1));
  return rows.filter((row) => !descendants.has(row.id));
}

/** Pure drop planning, shared by the route and behavioral tests. */
export function planGanttTaskDrop({
  rows,
  relations,
  activeId,
  overId,
  deltaX,
  maxNestDepth,
  previousDragDepth,
}: {
  rows: GanttDndRow[];
  relations: SubtaskRelation[];
  activeId: string;
  overId: string;
  deltaX: number;
  maxNestDepth?: number;
  previousDragDepth?: number;
}): GanttDropPlan | null {
  const active = rows.find((row) => row.id === activeId);
  const over = rows.find((row) => row.id === overId);
  if (!active || !over || active.isForeign || over.isForeign) return null;

  const candidates = removeChildrenOf(rows, activeId);
  if (!candidates.some((row) => row.id === overId)) return null;
  const projection = getProjection(
    candidates,
    activeId,
    overId,
    deltaX,
    undefined,
    maxDepthForBoardLimit(maxNestDepth),
    previousDragDepth ?? 0,
  );
  if (!projection) return null;
  /**
   * Defence in depth. `removeChildrenOf` above already strips every descendant
   * from the candidate list, so projection cannot currently name a parent inside
   * the dragged subtree — this branch is unreachable today and a negative
   * control confirms removing it breaks nothing. It stays because the candidate
   * filtering and the parent resolution are separate concerns: if either changes
   * (partial subtree collapse, cross-lane drops, a different collision
   * strategy), a cycle becomes reachable and would silently orphan a branch.
   */
  if (wouldCreateCycle(rows, activeId, projection.parentId)) return null;
  const prospectiveParent = projection.parentId
    ? rows.find((row) => row.id === projection.parentId)
    : null;
  if (prospectiveParent?.isForeign) return null;

  const subtreeIds = getSubtreeIds(rows, activeId);
  const subtree = rows
    .filter((row) => subtreeIds.includes(row.id))
    .map((row) => row.id);
  const withoutSubtree = rows
    .map((row) => row.id)
    .filter((id) => !subtreeIds.includes(id));
  const originalActiveIndex = rows.findIndex((row) => row.id === activeId);
  const originalOverIndex = rows.findIndex((row) => row.id === overId);
  if (originalOverIndex === -1) return null;
  // Match dnd-kit's arrayMove(activeIndex, overIndex) semantics exactly. The
  // destination is the hovered row's ORIGINAL slot. Computing the index after
  // removing the subtree creates the classic downward off-by-one bug.
  const insertAt =
    activeId === overId ? originalActiveIndex : originalOverIndex;
  const orderedIds = withoutSubtree.slice();
  orderedIds.splice(
    Math.max(0, Math.min(insertAt, orderedIds.length)),
    0,
    ...subtree,
  );

  const oldRelation = relations.find(
    (relation) =>
      relation.relationType === "subtask" && relation.targetTaskId === activeId,
  );
  const oldParentId = oldRelation?.sourceTaskId ?? active.parentId;
  const parentChanged = oldParentId !== projection.parentId;

  return {
    orderedIds,
    parentId: projection.parentId,
    depth: projection.depth,
    dragDepth: projection.dragDepth,
    deleteRelationId: parentChanged ? (oldRelation?.id ?? null) : null,
    createRelation:
      parentChanged && projection.parentId
        ? {
            sourceTaskId: projection.parentId,
            targetTaskId: activeId,
            relationType: "subtask",
          }
        : null,
  };
}

/** Apply visual order within each status column and emit the real reorder API payload. */
export function applyGanttOrder(
  board: BoardWithTasks,
  orderedIds: string[],
): { board: BoardWithTasks; updates: TaskOrderUpdate[] } {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const next = {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      tasks: column.tasks
        .slice()
        .sort(
          (a, b) =>
            (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
    })),
  };
  return {
    board: next,
    updates: next.columns.flatMap((column) =>
      column.tasks.map((task, position) => ({
        id: task.id,
        position,
        status: column.id,
      })),
    ),
  };
}
