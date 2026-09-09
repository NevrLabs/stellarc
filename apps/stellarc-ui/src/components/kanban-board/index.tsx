import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BoardSkeleton } from "@/components/common/board-skeleton";
import { PendingSyncIndicator } from "@/components/common/pending-sync-indicator";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { reorderBoardTask, taskOrderUpdates } from "@/lib/reorder-board-task";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import type { BoardWithTasks } from "@/types/board";
import BulkToolbar from "../bulk-selection/bulk-toolbar";

import Column from "./column";

type KanbanBoardProps = {
  board: BoardWithTasks;
  disableDragDrop?: boolean;
};

const pointerThenCorners: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (collisions.length > 0) {
    const cards = collisions.filter(
      ({ data }) => data?.droppableContainer.data.current?.type !== "column",
    );
    return cards.length > 0 ? cards : collisions;
  }
  return closestCorners(args);
};

function KanbanBoard({ board, disableDragDrop = false }: KanbanBoardProps) {
  const { setBoard } = useBoardStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
  } = useBulkSelectionStore();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [previewBoard, setPreviewBoard] = useState<BoardWithTasks | null>(null);
  const previewBoardRef = useRef<BoardWithTasks | null>(null);
  const lastPreviewDestinationRef = useRef<string | null>(null);

  const { isPending: isReorderPending, mutate: reorderTasks } =
    useReorderTasks();
  const navigate = useNavigate();

  useEffect(() => {
    if (board?.columns) {
      const allTaskIds = board.columns.flatMap((column) =>
        column.tasks.map((task) => task.id),
      );
      setAvailableTasks(allTaskIds);
    }
  }, [board, setAvailableTasks]);

  useEffect(() => {
    clearFocus();
  }, [clearFocus]);

  useRegisterShortcuts({
    shortcuts: {
      j: () => {
        focusNext();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      k: () => {
        focusPrevious();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      Enter: () => {
        if (focusedTaskId && board) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
            params: {
              organizationSlug: board.organizationId,
              boardSlug: board.id,
              taskId: focusedTaskId,
            },
          });
        }
      },
    },
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: disableDragDrop ? 999999 : 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: disableDragDrop ? 999999 : 250,
        tolerance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.8",
        },
      },
    }),
    duration: 300,
    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
    previewBoardRef.current = null;
    lastPreviewDestinationRef.current = null;
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();
    const currentBoard = previewBoardRef.current ?? board;
    const source = currentBoard.columns.find((column) =>
      column.tasks.some((task) => task.id === activeTaskId),
    );
    const destination = currentBoard.columns.find(
      (column) =>
        column.id === overId || column.tasks.some((task) => task.id === overId),
    );
    if (!source || !destination || source.id === destination.id) return;

    // Cross-column preview is intentionally deduped by destination. This
    // restores the missing bucket animation without cloning the full board on
    // every pointer frame (the performance regression fixed in 2e89abde).
    if (lastPreviewDestinationRef.current === destination.id) return;
    const result = reorderBoardTask(currentBoard, activeTaskId, overId);
    if (!result) return;
    lastPreviewDestinationRef.current = destination.id;
    previewBoardRef.current = result.board;
    setPreviewBoard(result.board);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    previewBoardRef.current = null;
    lastPreviewDestinationRef.current = null;
    setPreviewBoard(null);
    setActiveId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const hadPreview = previewBoardRef.current !== null;
    const currentBoard = previewBoardRef.current ?? board;
    setActiveId(null);
    previewBoardRef.current = null;
    lastPreviewDestinationRef.current = null;
    setPreviewBoard(null);

    if (!over || !currentBoard?.columns) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    const result = hadPreview
      ? { board: currentBoard }
      : reorderBoardTask(currentBoard, activeId, overId);
    if (!result) return;
    setBoard(result.board);
    reorderTasks({
      boardId: result.board.id,
      board: result.board,
      tasks: taskOrderUpdates(result.board),
    });
  };

  // #111: one board-shaped skeleton, shared with the route and BoardLayout.
  // This used to be a second, flat placeholder (four bare boxes with two grey
  // bars each) — the exact "nothing has loaded" look the ticket rejected.
  if (!board?.columns) {
    return <BoardSkeleton />;
  }

  const renderedBoard = previewBoard ?? board;
  const activeTask = activeId
    ? renderedBoard.columns
        .flatMap((col) => col.tasks)
        .find((task) => task.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerThenCorners}
      onDragCancel={handleDragCancel}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full w-full flex-col bg-linear-to-b from-muted/20 to-background">
        <div className="min-h-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <div className="flex h-full min-w-max gap-4 px-4 py-4 md:px-5">
            {renderedBoard.columns?.map((column) => (
              <div
                key={column.id}
                className="h-full max-w-96 min-w-80 shrink-0 flex-1"
              >
                <Column column={column} disableDragDrop={disableDragDrop} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={dropAnimation}>
        {activeTask ? (
          <div className="w-80 rotate-1 scale-[1.03] rounded-lg border border-ring/40 bg-card p-3 shadow-lg ring-2 ring-ring/35">
            <p className="text-[10px] font-mono text-muted-foreground">
              {activeTask.number}
            </p>
            <p className="mt-2 line-clamp-3 text-sm font-medium text-card-foreground">
              {activeTask.title}
            </p>
          </div>
        ) : null}
      </DragOverlay>

      <BulkToolbar />
      <PendingSyncIndicator pending={isReorderPending} />
    </DndContext>
  );
}

export default KanbanBoard;
