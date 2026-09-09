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
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { produce } from "immer";
import { Archive, ChevronDown, ChevronRight, Flag, Plus } from "lucide-react";
import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { PendingSyncIndicator } from "@/components/common/pending-sync-indicator";
import { applyGanttOrder } from "@/components/gantt/gantt-task-rail-dnd";
import { Checkbox } from "@/components/ui/checkbox";
import { priorityColorsTaskCard } from "@/constants/priority-colors";
import { useBulkOperations } from "@/hooks/mutations/task/use-bulk-operations";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import useCreateTaskRelation from "@/hooks/mutations/task-relation/use-create-task-relation";
import useDeleteTaskRelation from "@/hooks/mutations/task-relation/use-delete-task-relation";
import useGetBoardTaskRelations from "@/hooks/queries/task-relation/use-get-board-task-relations";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  commitNestDrop,
  hasNestModifier,
  planNestDrop,
} from "@/lib/board-nest-drop";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import {
  collapseToggleLabel,
  groupSameBucketSubtasks,
  type TaskTreeNode,
} from "@/lib/group-subtasks";
import { reorderBoardTask } from "@/lib/reorder-board-task";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import useListNestHintStore from "@/store/list-nest-hint";
import type { BoardWithTasks } from "@/types/board";
import BulkToolbar from "../bulk-selection/bulk-toolbar";
import { ArchiveTasksModal } from "../shared/modals/archive-tasks-modal";
import {
  buildListGroups,
  type ListGroupBy,
  readListGroupBy,
  taskStatus,
} from "./list-grouping";

import TaskRow from "./task-row";

const CreateTaskModal = lazy(
  () => import("../shared/modals/create-task-modal"),
);

type ListViewProps = {
  board: BoardWithTasks;
  disableDragDrop?: boolean;
  /**
   * Grouping is lifted to the route so BoardToolbar's single "Group by" drives
   * it. Omit to let ListView own the state (standalone usage).
   */
  listGroupBy?: ListGroupBy;
};

const NESTED_ROW_INDENT = ["", "ml-6", "ml-12", "ml-[4.5rem]"] as const;

type ColumnSectionProps = {
  active: boolean;
  board: BoardWithTasks;
  boardSlug: string;
  collapsedParentIds: ReadonlySet<string>;
  column: BoardWithTasks["columns"][number];
  expanded: boolean;
  showHeader?: boolean;
  onAddTask: () => void;
  onArchive: () => void;
  onToggle: () => void;
  onToggleParent: (parentId: string) => void;
  /** Literal hovered ticket highlighted as the Ctrl/Cmd nest parent. */
  nestTargetTaskId: string | null;
  isSelectMode: boolean;
  selectedTaskIds: ReadonlySet<string>;
  onSelectTasks: (taskIds: string[]) => void;
};

/** Stable component identity keeps each dnd-kit droppable mounted. */
const ColumnSection = memo(function ColumnSection({
  active,
  board,
  boardSlug,
  collapsedParentIds,
  column,
  expanded,
  showHeader = true,
  onAddTask,
  onArchive,
  onToggle,
  onToggleParent,
  nestTargetTaskId,
  isSelectMode,
  selectedTaskIds,
  onSelectTasks,
}: ColumnSectionProps) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });
  const groups = useMemo(
    () => groupSameBucketSubtasks(column.tasks),
    [column.tasks],
  );
  const showDropIndicator = active;

  const renderTreeNode = (node: TaskTreeNode, depth = 0): React.ReactNode => {
    const collapsed = collapsedParentIds.has(node.task.id);
    const hasChildren = node.children.length > 0;
    return (
      <div
        data-testid={hasChildren ? "list-task-group" : undefined}
        key={node.task.id}
      >
        {/*
          The collapse control belongs ON the parent row, not on a separate line
          between the parent and its children: rendered as its own block it read
          as an extra list item, and it carried the PARENT's indent so at depth 0
          it sat flush left while the children it controlled were indented — the
          affordance pointed at nothing. Inline and depth-indented, one row is
          one task.
        */}
        <div
          className={cn(
            "group/subtask flex min-w-0 items-center rounded-sm transition-colors",
            NESTED_ROW_INDENT[Math.min(depth, 3)],
            depth > 0 && "border-l-2 border-border/50",
            node.task.id === nestTargetTaskId &&
              "bg-primary/12 ring-2 ring-inset ring-primary/65",
          )}
        >
          {hasChildren ? (
            <button
              aria-expanded={!collapsed}
              aria-label={collapseToggleLabel({
                parentId: node.task.id,
                childCount: node.children.length,
                collapsed,
              })}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="list-subtask-toggle"
              onClick={() => onToggleParent(node.task.id)}
              title={collapseToggleLabel({
                parentId: node.task.id,
                childCount: node.children.length,
                collapsed,
              })}
              type="button"
            >
              {collapsed ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
          ) : (
            // Keep the title column aligned between parents and leaf rows;
            // without this every childless row shifted left by the toggle width.
            <span aria-hidden="true" className="size-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <TaskRow
              task={node.task}
              boardSlug={boardSlug}
              statusBadge={(() => {
                const status = taskStatus(board, node.task);
                if (!status) return null;
                /*
                  Icon only. The name is redundant next to a column of icons
                  that already encode status, and dropping it keeps the leading
                  metadata cluster narrow so titles start at the same x.

                  No border/background: pill chrome around a bare glyph reads as
                  a button. `title` carries the status name for hover and for
                  assistive tech now the visible text is gone — a plain <span>
                  has no implicit role, so `aria-label` is invalid on it.

                  No text-* class either: `getColumnIcon` already colours the
                  glyph per status (slate/sky/amber/emerald/...). Wrapping it in
                  `text-muted-foreground` inherited over that and left every
                  status looking identical — tolerable when a label sat next to
                  it, not once the icon is the only signal.
                */
                return (
                  <span
                    className="relative inline-flex size-5 shrink-0 items-center justify-center"
                    data-testid="list-task-status"
                    title={
                      node.task.archivedAt
                        ? `${status.name} (archived)`
                        : status.name
                    }
                  >
                    {getColumnIcon(status.id, status.isFinal, status.icon)}
                    {node.task.archivedAt && (
                      <Archive
                        aria-hidden="true"
                        className="absolute -bottom-1 -right-1 size-3 rounded-full bg-background text-muted-foreground"
                        data-testid="list-task-archived"
                      />
                    )}
                  </span>
                );
              })()}
            />
          </div>
        </div>
        {!collapsed &&
          node.children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "border-b border-border/50 transition-colors duration-150 overflow-auto",
        showDropIndicator && "border-l-4 border-l-ring bg-accent/35",
      )}
    >
      {showHeader && (
        <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
          <button
            type="button"
            onClick={() => onToggle()}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                expanded && "rotate-90",
              )}
            />
            <div className="flex items-center gap-2 h-4">
              {getColumnIcon(column.id, column.isFinal, column.icon)}
              <div className="flex items-center gap-1">
                <span className="mt-1 mr-1">{column.name}</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {column.tasks.length}
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            {isSelectMode && column.tasks.length > 0 && (
              <Checkbox
                aria-label={`Select all ${column.name} tickets`}
                aria-checked={
                  column.tasks.some((task) => selectedTaskIds.has(task.id)) &&
                  !column.tasks.every((task) => selectedTaskIds.has(task.id))
                    ? "mixed"
                    : undefined
                }
                checked={column.tasks.every((task) =>
                  selectedTaskIds.has(task.id),
                )}
                onCheckedChange={(checked) => {
                  const ids = new Set(column.tasks.map((task) => task.id));
                  onSelectTasks(
                    checked
                      ? [...new Set([...selectedTaskIds, ...ids])]
                      : [...selectedTaskIds].filter((id) => !ids.has(id)),
                  );
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                onAddTask();
              }}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title={t("tasks:listView.addTask")}
            >
              <Plus className="w-3 h-3" />
            </button>

            {column.isFinal && column.tasks.length > 0 && (
              <button
                type="button"
                onClick={() => onArchive()}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={t("tasks:listView.archiveAllTooltip")}
              >
                <Archive className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <div
          data-column-id={column.id}
          ref={setNodeRef}
          className="bg-card transition-[translate,opacity] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
        >
          <SortableContext
            items={column.tasks}
            strategy={verticalListSortingStrategy}
          >
            {/* Their grouping + collapse, without the per-row motion.div:
                one Framer Motion instance per row cost ~3s of main-thread
                blocking on a 180-task board. The CSS starting-style fade on
                the container gives the same visual entry for free. */}
            {groups.map((node) => renderTreeNode(node))}
          </SortableContext>

          {column.tasks.length === 0 && (
            <div className="py-6 px-4 text-center text-xs text-muted-foreground">
              {t("tasks:listView.noTasks")}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function ListView({
  board,
  disableDragDrop = false,
  listGroupBy: controlledGroupBy,
}: ListViewProps) {
  const { t } = useTranslation();
  const { setBoard } = useBoardStore();
  /*
    Grouping is owned by the route when List renders under BoardToolbar, so the
    toolbar's single "Group by" drives it. The internal state is the uncontrolled
    fallback for any caller that renders ListView standalone.
  */
  const [uncontrolledGroupBy, setListGroupByState] = useState<ListGroupBy>(() =>
    readListGroupBy(board.id),
  );
  useEffect(() => {
    setListGroupByState(readListGroupBy(board.id));
  }, [board.id]);
  const listGroupBy = controlledGroupBy ?? uncontrolledGroupBy;
  const listGroups = useMemo(
    () => buildListGroups(board, listGroupBy, t),
    [board, listGroupBy, t],
  );
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
    setSelectMode,
  } = useBulkSelectionStore();
  const { bulkArchive } = useBulkOperations();
  const {
    isPending: isReorderPending,
    mutate: reorderTasks,
    mutateAsync: reorderTasksAsync,
  } = useReorderTasks();
  // Drag-to-nest needs the board's relation list to know each row's current
  // parent; the same query the timeline reads.
  const { data: boardRelations } = useGetBoardTaskRelations(board?.id ?? "");
  const { mutateAsync: createTaskRelation } = useCreateTaskRelation();
  const { mutateAsync: deleteTaskRelation } = useDeleteTaskRelation(
    board?.id ?? "",
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  /** Literal task under the pointer; used for deterministic Ctrl/Cmd nest preview. */
  const [overTaskId, setOverTaskId] = useState<string | null>(null);
  /**
   * Ctrl/Cmd state during a drag.
   *
   * dnd-kit's DragEndEvent exposes neither modifier flags nor the originating
   * pointer event, so the modifier is tracked from live window events. The ref
   * is what `handleDragEnd` reads (it must be current at drop time, and state
   * updates are not synchronous); the state exists only to drive the "will
   * nest" affordance while dragging.
   */
  const [nestArmed, setNestArmed] = useState(false);
  const nestIntentRef = useRef(false);

  useEffect(() => {
    const sync = (event: KeyboardEvent | MouseEvent) => {
      const armed = hasNestModifier(event);
      nestIntentRef.current = armed;
      // Only surface the affordance mid-drag; otherwise every Ctrl+click in the
      // app would flash it.
      setNestArmed(armed && activeId !== null);
    };
    const clear = () => {
      nestIntentRef.current = false;
      setNestArmed(false);
    };

    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("pointermove", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("pointermove", sync);
      window.removeEventListener("blur", clear);
    };
  }, [activeId]);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    const sections: Record<string, boolean> = {};
    if (board?.columns) {
      for (const col of board.columns) {
        sections[col.id] = true;
      }
    }
    return sections;
  });
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    new Set(),
  );
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [columnToArchive, setColumnToArchive] = useState<
    BoardWithTasks["columns"][number] | null
  >(null);

  useEffect(() => {
    if (board?.columns) {
      const visibleTaskIds = board.columns
        .filter((column) => expandedSections[column.id])
        .flatMap((column) => column.tasks.map((task) => task.id));
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
        if (isSelectMode) return;
        focusNext();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      k: () => {
        if (isSelectMode) return;
        focusPrevious();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      Enter: () => {
        if (isSelectMode) return;
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
      activationConstraint: {
        distance: disableDragDrop || isSelectMode ? 999999 : 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: disableDragDrop || isSelectMode ? 999999 : 200,
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
      setOverTaskId(null);
      return;
    }

    if (board?.columns?.some((col) => col.id === over.id)) {
      setOverColumnId(over.id.toString());
      setOverTaskId(null);
      return;
    }

    const taskId = over.id.toString();
    setOverTaskId(taskId);
    const columnWithTask = board?.columns?.find((col) =>
      col.tasks.some((task) => task.id === taskId),
    );

    if (columnWithTask) {
      setOverColumnId(columnWithTask.id);
    } else {
      setOverColumnId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);
    setOverTaskId(null);
    const nestIntent = nestIntentRef.current;
    setNestArmed(false);

    if (!over || !board?.columns) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();

    // Ctrl/Cmd held at drop time means "nest under the row above", reusing the
    // timeline's planner so depth limits, cycle rules and parent resolution
    // stay identical across every view. dnd-kit's DragEndEvent carries no
    // modifier state, so it is tracked from live key/pointer events instead of
    // read off the event here.
    if (nestIntent) {
      const nestPlan = planNestDrop({
        board,
        relations: boardRelations?.relations ?? [],
        activeId: activeTaskId,
        overId,
        nestIntent: true,
      });

      if (nestPlan?.createRelation || nestPlan?.deleteRelationId) {
        setBoard(applyGanttOrder(board, nestPlan.orderedIds).board);
        try {
          await commitNestDrop({
            plan: nestPlan,
            board,
            boardId: board.id,
            activeId: activeTaskId,
            queryClient,
            reorderTasks: (args) => reorderTasksAsync(args),
            createTaskRelation,
            deleteTaskRelation,
          });
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : t("tasks:nest.error"),
          );
        }
        return;
      }

      // Modifier means nest, full stop. Never silently convert an illegal nest
      // into a reorder — that makes the preview lie and moves a ticket the user
      // explicitly did not ask to move.
      toast.error(t("tasks:nest.cannotNestReason"));
      return;
    }

    const result = reorderBoardTask(board, activeTaskId, overId);
    if (!result) return;
    setBoard(result.board);
    reorderTasks({
      boardId: board.id,
      board: result.board,
      tasks: result.updates,
    });
  };

  /**
   * Live Ctrl/Cmd preview. The exact hovered ticket is the candidate parent;
   * the same planner used at drop time decides whether that relationship is
   * legal, so the highlight cannot promise a mutation the drop will reject.
   */
  const nestPreview = useMemo(() => {
    if (!nestArmed || !activeId || !overTaskId || !board) return null;
    const activeTaskId = activeId.toString();
    const plan = planNestDrop({
      board,
      relations: boardRelations?.relations ?? [],
      activeId: activeTaskId,
      overId: overTaskId,
      nestIntent: true,
    });
    const target = board.columns
      .flatMap((column) => column.tasks)
      .find((task) => task.id === overTaskId);
    return {
      valid: Boolean(plan?.createRelation || plan?.deleteRelationId),
      targetId: overTaskId,
      targetTitle: target?.title ?? t("tasks:nest.unknownTarget"),
    };
  }, [activeId, board, boardRelations?.relations, nestArmed, overTaskId, t]);

  /*
    The hint itself renders in BoardToolbar (beside the search field) rather than
    in a second toolbar row here, but its state is produced by these drag
    handlers. Publish it so the toolbar can subscribe, and clear on unmount so
    the hint does not linger after leaving List view.
  */
  const setHintActive = useListNestHintStore((state) => state.setActive);
  const setHintArmed = useListNestHintStore((state) => state.setArmed);
  const setHintPreview = useListNestHintStore((state) => state.setPreview);

  useEffect(() => {
    setHintActive(true);
    return () => setHintActive(false);
  }, [setHintActive]);

  useEffect(() => {
    setHintArmed(nestArmed);
  }, [nestArmed, setHintArmed]);

  useEffect(() => {
    setHintPreview(nestPreview);
  }, [nestPreview, setHintPreview]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleArchiveClick = (column: BoardWithTasks["columns"][number]) => {
    if (!column.isFinal || column.tasks.length === 0) return;
    setColumnToArchive(column);
    setIsArchiveModalOpen(true);
  };

  const handleConfirmArchive = () => {
    if (!columnToArchive || !board) return;

    const taskIds = columnToArchive.tasks.map((task) => task.id);

    /*
      #226: archival writes `task.archived_at` and leaves `status` alone. This
      used to loop `updateTask` with `status: "archived"`, which now fails
      validation because "archived" is not a status — the action 400'd.
    */
    const updatedBoard = produce(board, (draft) => {
      const archivedColumn = draft?.columns?.find(
        (col) => col.id === columnToArchive.id,
      );
      if (!archivedColumn) return;
      archivedColumn.tasks = [];
    });

    setIsArchiveModalOpen(false);
    setColumnToArchive(null);

    if (taskIds.length === 0) return;

    setBoard(updatedBoard);

    bulkArchive(taskIds)
      .then(() => {
        toast.success(t("tasks:archive.success", { count: taskIds.length }));
      })
      .catch(() => {
        // restore the column: the server rejected the archive
        setBoard(board);
        toast.error(t("tasks:archive.error"));
      });
  };

  if (!board?.columns) {
    return null;
  }

  const activeTask = activeId
    ? board.columns
        ?.flatMap((col) => col.tasks)
        .find((task) => task.id === activeId)
    : null;

  return (
    <DndContext
      sensors={isSelectMode ? [] : sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[snapCenterToCursor]}
    >
      <div className="w-full h-full overflow-auto bg-muted/20">
        <div className="divide-y divide-border/50">
          {listGroups.map((group) => {
            const sourceColumn = group.column ?? board.columns[0];
            if (!sourceColumn) return null;
            const sectionId = `list-group:${listGroupBy}:${group.key}`;
            const section = {
              ...sourceColumn,
              id: sectionId,
              name:
                listGroupBy === "milestone" && !group.key
                  ? t("tasks:gantt.noMilestone")
                  : group.label,
              tasks: group.tasks,
              isFinal: group.column?.isFinal ?? false,
              icon: group.column?.icon ?? null,
            };
            return (
              <ColumnSection
                active={Boolean(activeId && overColumnId === section.id)}
                board={board}
                boardSlug={board.slug ?? ""}
                collapsedParentIds={collapsedParents}
                column={section}
                expanded={
                  listGroupBy === "none" ||
                  expandedSections[sectionId] !== false
                }
                showHeader={listGroupBy !== "none"}
                key={sectionId}
                onAddTask={() => {
                  setIsTaskModalOpen(true);
                  setActiveColumn(
                    group.column?.id ?? board.columns[0]?.id ?? "",
                  );
                }}
                onArchive={() =>
                  group.column ? handleArchiveClick(group.column) : undefined
                }
                onToggle={() => toggleSection(sectionId)}
                onToggleParent={(parentId) =>
                  setCollapsedParents((current) => {
                    const next = new Set(current);
                    if (next.has(parentId)) next.delete(parentId);
                    else next.add(parentId);
                    return next;
                  })
                }
                nestTargetTaskId={
                  nestPreview?.valid ? nestPreview.targetId : null
                }
                isSelectMode={isSelectMode}
                selectedTaskIds={selectedTaskIds}
                onSelectTasks={selectTasks}
              />
            );
          })}
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
            boardId={board.id}
            onClose={() => setIsTaskModalOpen(false)}
            status={activeColumn ?? "done"}
          />
        </Suspense>
      )}
      <ArchiveTasksModal
        open={isArchiveModalOpen}
        onClose={() => {
          setIsArchiveModalOpen(false);
          setColumnToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        taskCount={columnToArchive?.tasks.length ?? 0}
      />

      <BulkToolbar />
      <PendingSyncIndicator pending={isReorderPending} />
    </DndContext>
  );
}

export default ListView;
