import { produce } from "immer";
import type { BoardWithTasks } from "@/types/board";

export type TaskOrderUpdate = {
  id: string;
  position: number;
  status: string;
};

export const taskOrderUpdates = (board: BoardWithTasks): TaskOrderUpdate[] =>
  board.columns.flatMap((column) =>
    column.tasks.map((task, position) => ({
      id: task.id,
      position,
      status: column.id,
    })),
  );

type ReorderResult = {
  board: BoardWithTasks;
  updates: TaskOrderUpdate[];
};

/**
 * Move `from` to `to`, mirroring dnd-kit's `arrayMove` helper: the item ends up
 * at the index the target occupied in the ORIGINAL array.
 * https://github.com/clauderic/dnd-kit/blob/master/packages/sortable/src/utilities/arrayMove.ts
 */
function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0]);
  return next;
}

export function reorderBoardTask(
  board: BoardWithTasks,
  activeId: string,
  overId: string,
): ReorderResult | null {
  if (activeId === overId) return null;
  let updates: TaskOrderUpdate[] = [];
  let moved = false;
  const next = produce(board, (draft) => {
    const source = draft.columns.find((column) =>
      column.tasks.some((task) => task.id === activeId),
    );
    const destination = draft.columns.find(
      (column) =>
        column.id === overId || column.tasks.some((task) => task.id === overId),
    );
    if (!source || !destination) return;

    const sourceIndex = source.tasks.findIndex((task) => task.id === activeId);
    if (sourceIndex === -1) return;

    // Dropping on the column container itself (or an empty column) appends.
    const droppedOnColumn = overId === destination.id;

    /**
     * Dropping on a row means "take that row's slot".
     *
     * The old code removed the task first and then inserted at
     * `indexOf(over) + 1`, so it always landed one slot PAST the row it was
     * released on. Dragging DOWN happened to look correct — removing an earlier
     * item shifts the target up one, cancelling the `+1` — but dragging UP
     * landed a row too low every time, index 0 was unreachable, and
     * cross-column drops were off by one as well, because removing from the
     * source list cannot shift the destination list's indices at all.
     *
     * Both views (list and kanban board) share this function, which is why the
     * same off-by-one showed up in each.
     */
    if (source.id === destination.id) {
      // ---- SAME COLUMN ----------------------------------------------------
      const overIndex = droppedOnColumn
        ? source.tasks.length - 1
        : source.tasks.findIndex((task) => task.id === overId);
      if (overIndex === -1 || overIndex === sourceIndex) return;

      source.tasks = arrayMove(source.tasks, sourceIndex, overIndex);
    } else {
      // ---- CROSS COLUMN ---------------------------------------------------
      // Removal from the SOURCE cannot shift DESTINATION indices, so insert at
      // the target's index directly with no correction.
      const overIndex = droppedOnColumn
        ? destination.tasks.length
        : destination.tasks.findIndex((task) => task.id === overId);
      const insertIndex =
        overIndex === -1 ? destination.tasks.length : overIndex;

      const [task] = source.tasks.splice(sourceIndex, 1);
      task.status = destination.id;
      destination.tasks.splice(insertIndex, 0, task);
    }

    moved = true;

    const affected =
      source.id === destination.id ? [source] : [source, destination];
    updates = affected.flatMap((column) =>
      column.tasks.map((item, position) => ({
        id: item.id,
        position,
        status: column.id,
      })),
    );
  });

  return moved ? { board: next, updates } : null;
}
