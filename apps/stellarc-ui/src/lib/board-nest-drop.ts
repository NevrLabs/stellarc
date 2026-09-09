/**
 * Drag-to-nest for the board and list views.
 *
 * The timeline already had this gesture, and its planner
 * (`planGanttTaskDrop` -> `lib/task-nesting-projection`) is pure and
 * view-agnostic: rows in, plan out. Board and list reuse it verbatim rather
 * than growing a second nesting implementation that would drift on depth
 * limits, cycle rules and the intent threshold.
 *
 * What differs is how INTENT is expressed. The timeline has a horizontal rail,
 * so an x-offset within the time grid reads naturally as "indent this". A list
 * has no such axis: rows are a vertical stack, `snapCenterToCursor` re-centres
 * the drag overlay under the pointer, and `verticalListSortingStrategy` only
 * ever reports vertical neighbours — so horizontal travel is not a reliable
 * signal and a "drag a bit to the right" gesture is both undiscoverable and
 * flaky.
 *
 * Instead the list/board surfaces nest on an explicit modifier: hold Ctrl (or
 * Cmd) while dropping. That is unambiguous, keyboard-discoverable, and can be
 * advertised in a tooltip. It is fed into the shared planner as a synthetic
 * full-indent `deltaX` so ONE set of rules still governs every surface.
 */

import type { QueryClient } from "@tanstack/react-query";
import {
  applyGanttOrder,
  type GanttDndRow,
  planGanttTaskDrop,
} from "@/components/gantt/gantt-task-rail-dnd";
import { getSubtreeIds, wouldCreateCycle } from "@/lib/task-nesting-projection";
import type { BoardWithTasks } from "@/types/board";

export type SubtaskRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

/**
 * Flatten a board into the row shape the shared planner expects.
 *
 * `parentId` must come from the relation list, not from `task.parentTask`:
 * during an optimistic drag the relation cache is the value the planner's
 * old-parent comparison is built against.
 */
export function boardToNestRows({
  board,
  relations,
}: {
  board: BoardWithTasks;
  relations: SubtaskRelation[];
}): GanttDndRow[] {
  const parentOf = new Map<string, string>();
  for (const relation of relations) {
    if (relation.relationType === "subtask") {
      parentOf.set(relation.targetTaskId, relation.sourceTaskId);
    }
  }

  const depthOf = (id: string): number => {
    let depth = 0;
    let cursor = parentOf.get(id);
    const seen = new Set<string>([id]);
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      depth += 1;
      cursor = parentOf.get(cursor);
    }
    return depth;
  };

  return board.columns.flatMap((column) =>
    column.tasks.map((task) => ({
      id: task.id,
      parentId: parentOf.get(task.id) ?? null,
      depth: depthOf(task.id),
    })),
  );
}

/**
 * True when a pointer/keyboard event carries the nest modifier.
 *
 * Ctrl on Windows/Linux, Cmd on macOS. Exported so the view, the tooltip copy
 * and the tests all agree on one definition of the gesture.
 */
export function hasNestModifier(
  event: Pick<MouseEvent | KeyboardEvent, "ctrlKey" | "metaKey"> | null,
): boolean {
  return Boolean(event && (event.ctrlKey || event.metaKey));
}

/**
 * Turn the literal ticket under the pointer into the shared planner's drop slot.
 *
 * The planner resolves a parent from the row ABOVE a slot. Passing the hovered
 * ticket directly therefore picked its previous sibling — an invisible zone
 * rule that made Ctrl+drop look broken. For list/board surfaces the contract is
 * simpler: the hovered ticket IS the intended parent. We express that to the
 * shared planner by selecting the next row as the slot (or a synthetic terminal
 * slot when the target is last), keeping all cycle/depth validation centralized.
 */

/**
 * Plan a board/list drop. Returns null when the gesture is an illegal nest.
 *
 * `nestIntent` is the modifier state at drop time. It is translated into the
 * shared planner's `deltaX` as exactly one indent step, so nesting depth,
 * cycle refusal and parent resolution all come from the timeline's rules
 * rather than a parallel implementation.
 */
export function planNestDrop({
  board,
  relations,
  activeId,
  overId,
  nestIntent,
  previousDragDepth,
}: {
  board: BoardWithTasks;
  relations: SubtaskRelation[];
  activeId: string;
  overId: string;
  /** Ctrl/Cmd held at drop time. */
  nestIntent: boolean;
  previousDragDepth?: number;
}) {
  const rows = boardToNestRows({ board, relations });

  if (nestIntent) {
    // Ctrl/Cmd + drop has one literal meaning: the hovered ticket is the parent.
    // Do NOT run this through projection/drop zones — that abstraction resolves
    // the previous row as parent and is exactly what made the gesture opaque.
    const active = rows.find((row) => row.id === activeId);
    const parent = rows.find((row) => row.id === overId);
    if (!active || !parent || activeId === overId) return null;
    if (wouldCreateCycle(rows, activeId, overId)) return null;

    const parentDepth = parent.depth ?? 0;
    const activeSubtree = getSubtreeIds(rows, activeId);
    const deepestRelativeDepth = Math.max(
      0,
      ...rows
        .filter((row) => activeSubtree.includes(row.id))
        .map((row) => (row.depth ?? 0) - (active.depth ?? 0)),
    );
    if (parentDepth + 1 + deepestRelativeDepth > board.subtaskDepthLimit) {
      return null;
    }

    // Keep the dragged subtree intact and append it after the parent's existing
    // subtree. This makes the resulting list render parent -> current children
    // -> newly nested ticket, rather than splitting the hierarchy.
    const parentSubtree = getSubtreeIds(rows, overId);
    const withoutActive = rows
      .map((row) => row.id)
      .filter((id) => !activeSubtree.includes(id));
    const finalParentDescendant = [...parentSubtree]
      .reverse()
      .find((id) => withoutActive.includes(id));
    const insertAfter = finalParentDescendant
      ? withoutActive.indexOf(finalParentDescendant)
      : withoutActive.indexOf(overId);
    const orderedIds = withoutActive.slice();
    orderedIds.splice(insertAfter + 1, 0, ...activeSubtree);

    const oldRelation = relations.find(
      (relation) =>
        relation.relationType === "subtask" &&
        relation.targetTaskId === activeId,
    );
    const oldParentId = oldRelation?.sourceTaskId ?? active.parentId;
    const parentChanged = oldParentId !== overId;
    return {
      orderedIds,
      parentId: overId,
      depth: parentDepth + 1,
      dragDepth: parentDepth + 1,
      deleteRelationId: parentChanged ? (oldRelation?.id ?? null) : null,
      createRelation: parentChanged
        ? {
            sourceTaskId: overId,
            targetTaskId: activeId,
            relationType: "subtask" as const,
          }
        : null,
    };
  }

  // Plain drag remains the timeline planner's ordinary reorder/unnest path.
  return planGanttTaskDrop({
    rows,
    relations,
    activeId,
    overId,
    deltaX: 0,
    maxNestDepth: board.subtaskDepthLimit,
    previousDragDepth,
  });
}

/**
 * Commit a planned drop: reorder, then reconcile the parent relation, then
 * invalidate every query key that feeds a surface showing nesting.
 *
 * The invalidation set is deliberately the same one the sub-ticket refresh fix
 * established — board/list read `task.parentTask` off the task rows while the
 * timeline reads `board-task-relations` and the drawer reads
 * `task-relations`, so missing any one of them leaves a stale surface.
 */
export async function commitNestDrop({
  plan,
  board,
  boardId,
  activeId,
  queryClient,
  reorderTasks,
  createTaskRelation,
  deleteTaskRelation,
}: {
  plan: NonNullable<ReturnType<typeof planNestDrop>>;
  board: BoardWithTasks;
  boardId: string;
  activeId: string;
  queryClient: QueryClient;
  reorderTasks: (args: {
    boardId: string;
    board: BoardWithTasks;
    tasks: ReturnType<typeof applyGanttOrder>["updates"];
  }) => Promise<unknown>;
  createTaskRelation: (args: {
    sourceTaskId: string;
    targetTaskId: string;
    relationType: "subtask";
  }) => Promise<unknown>;
  deleteTaskRelation: (id: string) => Promise<unknown>;
}) {
  const reordered = applyGanttOrder(board, plan.orderedIds);

  await reorderTasks({
    boardId,
    board: reordered.board,
    tasks: reordered.updates,
  });

  if (plan.deleteRelationId) await deleteTaskRelation(plan.deleteRelationId);
  if (plan.createRelation) await createTaskRelation(plan.createRelation);

  const affected = [activeId, plan.parentId].filter(Boolean) as string[];
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["board-task-relations", boardId],
    }),
    queryClient.invalidateQueries({ queryKey: ["tasks", boardId] }),
    ...affected.map((id) =>
      queryClient.invalidateQueries({ queryKey: ["task-relations", id] }),
    ),
  ]);

  return reordered;
}
