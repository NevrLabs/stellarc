import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useNavigate } from "@tanstack/react-router";
import { produce } from "immer";
import { Archive, ChevronRight, Clock, Flag, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PendingSyncIndicator } from "@/components/common/pending-sync-indicator";
import { Checkbox } from "@/components/ui/checkbox";
import { priorityColorsTaskCard } from "@/constants/priority-colors";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import { useSetTaskArchived } from "@/hooks/mutations/task/use-set-task-archived";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/cn";
import {
  type BacklogSection,
  backlogSectionOf,
  isArchived,
  sectionCrossPayload,
} from "@/lib/task-archival";
import { toast } from "@/lib/toast";
import useBacklogBulkSelectionStore from "@/store/backlog-bulk-selection";
import useBoardStore from "@/store/board";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";
import BacklogBulkToolbar from "../bulk-selection/backlog-bulk-toolbar";

import BacklogTaskRow from "./backlog-task-row";

const CreateTaskModal = lazy(
  () => import("../shared/modals/create-task-modal"),
);

type BacklogListViewProps = {
  board?: BoardWithTasks;
  disableDragDrop?: boolean;
};

function BacklogListView({
  board,
  disableDragDrop = false,
}: BacklogListViewProps) {
  const { t } = useTranslation();
  const { isPending: isReorderPending, mutate: reorderTasks } =
    useReorderTasks();
  const { mutateAsync: setArchived } = useSetTaskArchived();
  const { setBoard } = useBoardStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
    clearSelection,
    isSelectMode,
    selectedTaskIds,
    selectTasks,
  } = useBacklogBulkSelectionStore();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    planned: true,
    archived: true,
  });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  useEffect(() => {
    if (board) {
      const visibleTaskIds: string[] = [];
      if (expandedSections.planned) {
        visibleTaskIds.push(
          ...(board.plannedTasks || []).map((task) => task.id),
        );
      }
      if (expandedSections.archived) {
        visibleTaskIds.push(
          ...(board.archivedTasks || []).map((task) => task.id),
        );
      }
      setAvailableTasks(visibleTaskIds);
    }
  }, [board, expandedSections, setAvailableTasks]);

  useEffect(() => {
    clearFocus();
    return () => clearSelection();
  }, [clearFocus, clearSelection]);

  useRegisterShortcuts({
    shortcuts: {
      j: () => {
        focusNext();
        const state = useBacklogBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      k: () => {
        focusPrevious();
        const state = useBacklogBulkSelectionStore.getState();
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
        delay: disableDragDrop ? 999999 : 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activeId) {
      setOverColumnId(null);
      return;
    }

    if (over.id === "planned" || over.id === "archived") {
      setOverColumnId(over.id.toString());
      return;
    }

    const taskId = over.id.toString();
    const plannedTasks = board?.plannedTasks || [];
    const archivedTasks = board?.archivedTasks || [];

    // membership is decided by which bucket the API returned the task in, which
    // is driven by `archivedAt` — never by status.
    if (plannedTasks.some((task) => task.id === taskId)) {
      setOverColumnId("planned");
    } else if (archivedTasks.some((task) => task.id === taskId)) {
      setOverColumnId("archived");
    } else {
      setOverColumnId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);

    if (!over || !board) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();

    const plannedTasks = board.plannedTasks || [];
    const archivedTasks = board.archivedTasks || [];
    const activeTask = [...plannedTasks, ...archivedTasks].find(
      (task) => task.id === activeTaskId,
    );

    if (!activeTask) return;

    /*
      #226: which section a ticket is in is decided by `archivedAt`, NOT status.
      Archived tickets retain their real workflow status, so the old
      `activeTask.status === "planned"` test mis-classified any archived ticket
      whose status was not literally "planned" and moved the wrong row.
    */
    const sourceIsArchived = isArchived(activeTask);
    const sourceSectionId = backlogSectionOf(activeTask);

    let targetSection = overId;
    if (overId !== "planned" && overId !== "archived") {
      if (plannedTasks.some((task) => task.id === overId)) {
        targetSection = "planned";
      } else if (archivedTasks.some((task) => task.id === overId)) {
        targetSection = "archived";
      } else {
        return;
      }
    }

    const crossesSection = sourceSectionId !== targetSection;

    const updatedBoard = produce(board, (draft) => {
      const sourceSection = sourceIsArchived
        ? draft.archivedTasks || []
        : draft.plannedTasks || [];

      const sourceTaskIndex = sourceSection.findIndex(
        (task) => task.id === activeTaskId,
      );
      const task = sourceSection[sourceTaskIndex];

      if (!task) return;

      if (sourceIsArchived) {
        draft.archivedTasks =
          draft.archivedTasks?.filter((t) => t.id !== activeTaskId) || [];
      } else {
        draft.plannedTasks =
          draft.plannedTasks?.filter((t) => t.id !== activeTaskId) || [];
      }

      if (!crossesSection) {
        const targetSectionTasks = sourceIsArchived
          ? draft.archivedTasks || []
          : draft.plannedTasks || [];

        let destinationIndex = targetSectionTasks.findIndex(
          (t) => t.id === overId,
        );

        if (sourceTaskIndex <= destinationIndex) {
          destinationIndex += 1;
        }

        if (sourceIsArchived) {
          draft.archivedTasks?.splice(destinationIndex, 0, task);
        } else {
          draft.plannedTasks?.splice(destinationIndex, 0, task);
        }
        return;
      }

      /*
        Crossing between Planned and Archived toggles `archivedAt` only. Status
        is deliberately left alone: dragging a Done ticket into Archived must
        keep it Done, and dragging it back out must not invent a status.

        Moving OUT of Archived into Planned is the one case that also changes
        status, because Planned is a real status the ticket must actually adopt.
      */
      const crossPayload = sectionCrossPayload({
        task,
        targetSection: targetSection as BacklogSection,
      });
      task.status = crossPayload.status;

      if (crossPayload.archived) {
        task.archivedAt = new Date().toISOString();
        draft.archivedTasks = [...(draft.archivedTasks || []), task];
      } else {
        task.archivedAt = null;
        draft.plannedTasks = [...(draft.plannedTasks || []), task];
      }
    });

    setBoard(updatedBoard);

    if (crossesSection) {
      setArchived({
        taskId: activeTaskId,
        archived: targetSection === "archived",
        boardId: board.id,
      }).catch((error) => {
        setBoard(board);
        toast.error(
          error instanceof Error ? error.message : t("tasks:archive.error"),
        );
      });
    }

    /*
      Reorder persists position within the sections. Archived rows keep their
      own status, so this sends each task's ACTUAL status rather than the
      section name — sending "archived" here is what produced the
      `Invalid status "archived"` 400.
    */
    const affected = crossesSection
      ? [updatedBoard.plannedTasks || [], updatedBoard.archivedTasks || []]
      : [
          targetSection === "planned"
            ? updatedBoard.plannedTasks || []
            : updatedBoard.archivedTasks || [],
        ];

    reorderTasks({
      boardId: board.id,
      board: updatedBoard,
      tasks: affected.flatMap((tasks) =>
        tasks.map((task, position) => ({
          id: task.id,
          position,
          status: task.status,
        })),
      ),
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  function BacklogSection({
    sectionId,
    title,
    icon: IconComponent,
    tasks,
    showAddButton = false,
  }: {
    sectionId: string;
    title: string;
    icon: typeof Clock;
    tasks: Task[];
    showAddButton?: boolean;
  }) {
    const { setNodeRef } = useDroppable({
      id: sectionId,
      data: {
        type: "column",
        column: { id: sectionId, name: title },
      },
    });

    const showDropIndicator = activeId && overColumnId === sectionId;

    return (
      <div
        className={cn(
          "border-b border-border/50 transition-colors duration-150 overflow-auto",
          showDropIndicator && "border-l-4 border-l-ring bg-accent/35",
        )}
      >
        <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
          <button
            type="button"
            onClick={() => toggleSection(sectionId)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                expandedSections[sectionId] && "rotate-90",
              )}
            />
            <div className="flex items-center gap-2 h-4">
              <IconComponent className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              <div className="flex items-center gap-1">
                <span className="mt-1 mr-1">
                  {t(`tasks:backlog.sections.${sectionId}`, {
                    defaultValue: title,
                  })}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {tasks.length}
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            {isSelectMode && tasks.length > 0 && (
              <Checkbox
                aria-label={`Select all ${title} tickets`}
                checked={
                  tasks.every((task) => selectedTaskIds.has(task.id))
                    ? true
                    : tasks.some((task) => selectedTaskIds.has(task.id))
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => {
                  const sectionIds = new Set(tasks.map((task) => task.id));
                  selectTasks(
                    checked
                      ? [...new Set([...selectedTaskIds, ...sectionIds])]
                      : [...selectedTaskIds].filter(
                          (id) => !sectionIds.has(id),
                        ),
                  );
                }}
              />
            )}
            {showAddButton && (
              <button
                type="button"
                onClick={() => {
                  setIsTaskModalOpen(true);
                  setActiveColumn("planned");
                }}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={t("tasks:backlog.addTask")}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {expandedSections[sectionId] && (
          <div
            ref={setNodeRef}
            className="bg-card transition-[translate,opacity] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
          >
            <SortableContext
              items={tasks}
              strategy={verticalListSortingStrategy}
            >
              {/* No per-row motion wrapper — see list-view/index.tsx: one
                  Framer Motion instance per row dominates mount cost on large
                  boards. */}
              {tasks.map((task) => (
                <BacklogTaskRow key={task.id} task={task} />
              ))}
            </SortableContext>

            {tasks.length === 0 && (
              <div className="py-6 px-4 text-center text-xs text-muted-foreground">
                {t("tasks:backlog.noTasksInSection", {
                  section: t(`tasks:backlog.sections.${sectionId}`, {
                    defaultValue: title,
                  }).toLowerCase(),
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!board) {
    return null;
  }

  const plannedTasks = board.plannedTasks || [];
  const archivedTasks = board.archivedTasks || [];

  const activeTask =
    board.plannedTasks.find((task) => task.id === activeId) ||
    board.archivedTasks.find((task) => task.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[snapCenterToCursor]}
    >
      <div className="w-full h-full overflow-auto bg-muted/20">
        <div className="divide-y divide-border/50">
          <BacklogSection
            sectionId="planned"
            title={t("tasks:backlog.sections.planned")}
            icon={Clock}
            tasks={plannedTasks}
            showAddButton={true}
          />

          <BacklogSection
            sectionId="archived"
            title={t("tasks:backlog.sections.archived")}
            icon={Archive}
            tasks={archivedTasks}
          />
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="bg-card border border-border rounded-lg shadow-lg p-2 max-w-[200px] cursor-grabbing">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                <Flag
                  className={cn(
                    "w-3 h-3",
                    priorityColorsTaskCard[
                      activeTask.priority as keyof typeof priorityColorsTaskCard
                    ],
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {board?.slug}-{activeTask.number}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {activeTask.title}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>

      {isTaskModalOpen && (
        <Suspense fallback={<span className="sr-only">Loading editor</span>}>
          <CreateTaskModal
            open
            boardId={board?.id}
            onClose={() => setIsTaskModalOpen(false)}
            status={activeColumn ?? "planned"}
          />
        </Suspense>
      )}

      <BacklogBulkToolbar />
      <PendingSyncIndicator pending={isReorderPending} />
    </DndContext>
  );
}

export default BacklogListView;
