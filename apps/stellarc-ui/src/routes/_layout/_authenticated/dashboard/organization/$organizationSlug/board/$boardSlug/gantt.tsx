import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format, isSameMonth, isToday, isWeekend, startOfDay } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Search,
} from "lucide-react";
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import BoardToolbar from "@/components/board/board-toolbar";
import BoardLayout from "@/components/common/board-layout";
import { PendingSyncIndicator } from "@/components/common/pending-sync-indicator";
import TaskViewControls from "@/components/common/task-view-controls";
import { GanttDependencyArrows } from "@/components/gantt/gantt-dependency-arrows";
import { GanttMilestoneRow } from "@/components/gantt/gantt-milestone-row";
import {
  buildGanttMilestones,
  milestoneMatchesQuery,
  milestoneTimelineDates,
} from "@/components/gantt/gantt-milestones";
import {
  matchesTaskQuery,
  partitionTasksBySchedule,
} from "@/components/gantt/gantt-scheduling";
import {
  buildGanttSections,
  visibleSectionRows,
} from "@/components/gantt/gantt-sections";
import { GanttTaskBar } from "@/components/gantt/gantt-task-bar";
import {
  applyGanttOrder,
  planGanttTaskDrop,
  removeChildrenOf,
} from "@/components/gantt/gantt-task-rail-dnd";
import {
  buildTimeline,
  dayOffsetRem,
  type GanttZoom,
  gridLineGradient,
  weekendTintGradient,
} from "@/components/gantt/gantt-timeline";
import { GanttUnscheduledTrack } from "@/components/gantt/gantt-unscheduled-track";
import PageTitle from "@/components/page-title";
import CreateTaskAction from "@/components/task/create-task-action";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReorderTasks } from "@/hooks/mutations/task/use-reorder-tasks";
import useCreateTaskRelation from "@/hooks/mutations/task-relation/use-create-task-relation";
import useDeleteTaskRelation from "@/hooks/mutations/task-relation/use-delete-task-relation";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetBoardTaskRelations from "@/hooks/queries/task-relation/use-get-board-task-relations";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTaskFiltersWithLabelsSupport } from "@/hooks/use-task-filters-with-labels-support";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import { getStatusLabel } from "@/lib/i18n/domain";
import {
  type DisplayConfig,
  type GroupField,
  type SortConfig,
  sortTasks,
} from "@/lib/sort-tasks";
import {
  getDragDepth,
  INDENTATION_WIDTH_PX,
} from "@/lib/task-nesting-projection";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";

type GanttSearchParams = {
  taskId?: string;
};

const ZOOM_LEVELS: GanttZoom[] = ["day", "week", "month"];
const ROW_HEIGHT_PX = 30;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

type ScheduledTask = {
  id: string;
  title: string;
  number: number | null;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  userId?: string | null;
  assigneeId?: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  boardId: string;
  scheduleStart?: Date;
  scheduleEnd?: Date;
  isForeign?: boolean;
  boardName?: string;
  boardSlug?: string;
  milestoneId?: string | null;
  milestoneName?: string | null;
};

type FlatRow = ScheduledTask & {
  depth: number;
  hasChildren: boolean;
  parentId: string | null;
};

/** A row that has dates and can therefore be drawn as a bar. */
type ScheduledFlatRow = FlatRow & { scheduleStart: Date; scheduleEnd: Date };

type Relation = {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

/** Build a tree from subtask edges, then flatten with depth for rendering. */
function buildNestedRows(
  tasks: ScheduledTask[],
  relations: Relation[],
): FlatRow[] {
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  const taskSet = new Set(tasks.map((t) => t.id));

  for (const rel of relations) {
    if (rel.relationType !== "subtask") continue;
    if (!taskSet.has(rel.sourceTaskId) || !taskSet.has(rel.targetTaskId))
      continue;
    const arr = childrenOf.get(rel.sourceTaskId) ?? [];
    arr.push(rel.targetTaskId);
    childrenOf.set(rel.sourceTaskId, arr);
    parentOf.set(rel.targetTaskId, rel.sourceTaskId);
  }

  const roots = tasks.filter((t) => !parentOf.has(t.id));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const rows: FlatRow[] = [];
  const visited = new Set<string>();

  const walk = (taskId: string, depth: number) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) return;
    const kids = childrenOf.get(taskId) ?? [];
    rows.push({
      ...task,
      depth,
      hasChildren: kids.length > 0,
      parentId: parentOf.get(taskId) ?? null,
    });
    for (const childId of kids) walk(childId, depth + 1);
  };

  for (const root of roots) walk(root.id, 0);
  for (const task of tasks) {
    if (!visited.has(task.id))
      rows.push({ ...task, depth: 0, hasChildren: false, parentId: null });
  }

  return rows;
}

/** Filter flat rows by collapsed state — hide rows whose ancestor is collapsed. */
function applyCollapsed(rows: FlatRow[], collapsed: Set<string>): FlatRow[] {
  if (collapsed.size === 0) return rows;
  // O(n): pre-build parentId map instead of linear search per ancestor.
  const parentMap = new Map(rows.map((r) => [r.id, r.parentId]));
  const hidden = new Set<string>();
  for (const row of rows) {
    let ancestor = row.parentId;
    while (ancestor) {
      if (collapsed.has(ancestor)) {
        hidden.add(row.id);
        break;
      }
      ancestor = parentMap.get(ancestor) ?? null;
    }
  }
  return rows.filter((r) => !hidden.has(r.id));
}

// --- Row component (memoized for render perf) ---

type RowProps = {
  task: FlatRow;
  timeline: NonNullable<ReturnType<typeof buildTimeline>>;
  pixelsPerDay: number;
  isMobile: boolean;
  showTaskRail: boolean;
  taskColumnWidthRem: number;
  boardSlug: string | undefined;
  collapsed: boolean;
  display: DisplayConfig;
  /** Copy shown in the track for a task with no dates. */
  unscheduledHint: string;
  onToggleCollapse: (id: string) => void;
  onOpenTask: (task: FlatRow) => void;
  projectedDepth?: number;
  prospectiveParent?: boolean;
  /**
   * Rows outside a DndContext (the unscheduled lane) must not advertise a drag
   * affordance they cannot honour, so reordering is opt-in per lane.
   */
  sortable?: boolean;
};

const GanttRow = memo(function GanttRow({
  task,
  timeline,
  pixelsPerDay,
  isMobile,
  showTaskRail,
  taskColumnWidthRem,
  boardSlug,
  collapsed,
  display,
  unscheduledHint,
  onToggleCollapse,
  onOpenTask,
  projectedDepth,
  prospectiveParent,
  sortable = false,
}: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !sortable || Boolean(task.isForeign),
  });
  const dragEnabled = sortable && !task.isForeign;
  const isScheduled = Boolean(task.scheduleStart && task.scheduleEnd);
  return (
    <div
      ref={setNodeRef}
      data-testid={`gantt-row-${task.id}`}
      className="grid items-stretch border-b border-border/60"
      style={{
        height: `${ROW_HEIGHT_PX}px`,
        // `content-visibility: auto` skips rendering off-screen rows, but a row
        // being dragged must stay painted or it flickers mid-drag.
        contentVisibility: isDragging ? undefined : "auto",
        containIntrinsicSize: isDragging
          ? undefined
          : `auto ${ROW_HEIGHT_PX}px`,
        gridTemplateColumns: showTaskRail
          ? isMobile
            ? `${taskColumnWidthRem}rem max-content`
            : "20rem max-content"
          : "max-content",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      {showTaskRail ? (
        <div
          {...(dragEnabled ? attributes : {})}
          {...(dragEnabled ? listeners : {})}
          data-testid={`gantt-task-rail-${task.id}`}
          className={cn(
            "sticky left-0 z-[11] h-full border-r border-border bg-background",
            dragEnabled && "cursor-grab touch-none active:cursor-grabbing",
            prospectiveParent &&
              "bg-primary/10 ring-1 ring-inset ring-primary/50",
          )}
        >
          {/* Chevron and label are siblings, not nested: a <button> inside a
              <button> is invalid HTML and breaks hydration. */}
          <div
            className="flex h-full w-full min-w-0 items-center gap-1 pr-2"
            style={{
              paddingLeft: `${(projectedDepth ?? task.depth) * INDENTATION_WIDTH_PX + 4}px`,
            }}
          >
            {task.hasChildren ? (
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand subtasks" : "Collapse subtasks"}
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/10"
                onClick={() => onToggleCollapse(task.id)}
              >
                {collapsed ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left transition-colors hover:bg-muted"
              onClick={() => onOpenTask(task)}
            >
              {/*
                #129: the status was an uppercase text chip, which is noisy in
                a dense timeline row and inconsistent with every other surface.
                Now the same coloured icon the board, toolbar and My Tasks use,
                with the name kept as a tooltip rather than repeated as text.
              */}
              <span
                className="flex size-3.5 shrink-0 items-center justify-center"
                data-testid="gantt-status-icon"
                title={getStatusLabel(task.status)}
              >
                {getColumnIcon(task.status)}
              </span>
              {display.priority && task.priority ? (
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-px text-[9px] font-medium",
                    task.priority === "urgent" && "text-destructive-foreground",
                    task.priority === "high" && "text-warning-foreground",
                    task.priority === "medium" && "text-warning-foreground/85",
                    task.priority === "low" && "text-info-foreground",
                  )}
                >
                  {task.priority}
                </span>
              ) : null}
              <span className="shrink-0 truncate text-[9px] text-muted-foreground">
                {task.isForeign
                  ? `${task.boardSlug}-${task.number}`
                  : `${boardSlug}-${task.number}`}
              </span>
              {task.isForeign ? (
                <span className="shrink-0 rounded border border-dashed border-border px-1 py-px text-[9px] text-muted-foreground">
                  {task.boardName}
                </span>
              ) : null}
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {task.title}
              </span>
              {display.assignee && task.assigneeName ? (
                <span
                  className="shrink-0"
                  title={task.assigneeName ?? undefined}
                >
                  <Avatar
                    className={cn(
                      "size-4",
                      getAvatarTone(task.userId, task.assigneeId),
                    )}
                  >
                    <AvatarImage
                      src={task.assigneeImage ?? ""}
                      alt={task.assigneeName}
                    />
                    <AvatarFallback className="bg-transparent text-[8px] font-medium">
                      {getInitials(task.assigneeName)}
                    </AvatarFallback>
                  </Avatar>
                </span>
              ) : null}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="relative shrink-0 select-none"
        style={{ minWidth: `${timeline.timelineMinWidthRem}rem` }}
      >
        {isScheduled ? (
          <GanttTaskBar
            // GanttTaskBar types its task as the full Task shape; these rows
            // are the timeline's narrower projection of the same records.
            task={
              task as unknown as Task & {
                scheduleStart: Date;
                scheduleEnd: Date;
              }
            }
            timeline={timeline}
            pixelsPerDay={pixelsPerDay}
            isMobile={isMobile}
            readOnly={task.isForeign}
            onOpenTask={() => onOpenTask(task)}
          />
        ) : (
          // #244: no dates means no bar — but the row still owns a full track,
          // so dragging across it paints and commits a range, which is the only
          // way to schedule from this view on a mostly-unscheduled board.
          <GanttUnscheduledTrack
            task={task as unknown as Task}
            timeline={timeline}
            pixelsPerDay={pixelsPerDay}
            isMobile={isMobile}
            readOnly={task.isForeign}
            hint={unscheduledHint}
            onOpenTask={() => onOpenTask(task)}
          />
        )}
      </div>
    </div>
  );
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId, organizationSlug } = useBoardSlug();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutateAsync: reorderTasks } = useReorderTasks();
  const { mutateAsync: createTaskRelation } = useCreateTaskRelation();
  const { mutateAsync: deleteTaskRelation } = useDeleteTaskRelation(boardId);
  const { data: board, isPlaceholderData } = useGetTasks(boardId);
  const { data: boardMilestones } = useGetMilestonesByBoard(boardId);
  const { data: relationData } = useGetBoardTaskRelations(boardId);
  const { data: orgMembers } = useGetActiveOrganizationMembers(organizationId);
  const { data: organizationLabels = [] } =
    useGetLabelsByOrganization(organizationId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [searchQuery, setSearchQuery] = useState("");
  // #152: timeline sections are collapsible.
  const [unscheduledCollapsed, setUnscheduledCollapsed] = useState(false);
  const [zoom, setZoom] = useState<GanttZoom>("day");
  const [sort, setSort] = useState<SortConfig>({
    field: "position",
    direction: "asc",
  });
  const [group, setGroup] = useState<GroupField>("none");
  const [display, setDisplay] = useState<DisplayConfig>({
    assignee: true,
    priority: false,
    labels: false,
    dates: true,
  });
  const isMobile = useIsMobile();
  const [isTaskRailOpen, setIsTaskRailOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  /** Milestone sections the user has folded shut. */
  const [collapsedMilestoneIds, setCollapsedMilestoneIds] = useState<
    Set<string>
  >(new Set());
  const [drag, setDrag] = useState<{
    activeId: string;
    overId: string;
    deltaX: number;
    /**
     * Intent-box level carried between move events. Hysteresis needs the
     * previous level, so it lives in drag state rather than being recomputed
     * from deltaX alone.
     */
    dragDepth: number;
  } | null>(null);
  const [dropPending, setDropPending] = useState(false);
  const sensors = useSensors(
    // 8px of travel before a drag starts, so a plain click still opens the task
    // instead of being swallowed as a micro-drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const taskColumnWidthRem = isMobile ? 12 : 14;
  const showTaskRail = !isMobile || isTaskRailOpen;
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const [pixelsPerDay, setPixelsPerDay] = useState(44);

  useEffect(() => {
    if (!isMobile) {
      setIsTaskRailOpen(true);
      return;
    }
    setIsTaskRailOpen(false);
  }, [isMobile]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allTasks = useMemo(
    () => [
      ...(board?.columns.flatMap(
        (column: { tasks: ScheduledTask[] }) => column.tasks,
      ) ?? []),
      ...(board?.plannedTasks ?? []),
    ],
    [board],
  );

  const {
    filters,
    updateFilter,
    updateLabelFilter,
    clearFilters,
    hasActiveFilters,
  } = useTaskFiltersWithLabelsSupport(board, boardId, searchQuery);

  const filteredAllTasks = useMemo(
    () =>
      filters.status ||
      filters.priority ||
      filters.assignee ||
      filters.dueDate ||
      filters.labels
        ? allTasks.filter((task) => {
            if (filters.status?.length && !filters.status.includes(task.status))
              return false;
            if (
              filters.priority?.length &&
              !filters.priority.includes(task.priority ?? "")
            )
              return false;
            if (
              filters.assignee?.length &&
              !filters.assignee.includes(
                (task as { userId?: string; assigneeId?: string }).userId ??
                  (task as { assigneeId?: string }).assigneeId ??
                  "",
              )
            )
              return false;
            if (filters.dueDate?.length) {
              if (filters.dueDate.includes("no_due_date") && !task.dueDate)
                return true;
              if (!task.dueDate) return false;
            }
            if (
              filters.labels?.length &&
              !(task as { labels?: Array<{ id: string }> }).labels?.some(
                (label) => filters.labels!.includes(label.id),
              )
            )
              return false;
            return true;
          })
        : allTasks,
    [allTasks, filters],
  );
  const ganttMilestones = useMemo(
    () => buildGanttMilestones(boardMilestones, filteredAllTasks),
    [boardMilestones, filteredAllTasks],
  );

  const foreignRows = useMemo(() => {
    return (relationData?.foreignTasks ?? []).map((task) => ({
      ...task,
      description: null,
      position: null,
      createdAt: "",
      userId: null,
      assigneeId: null,
      assigneeName: null,
      assigneeImage: null,
      columnId: null,
      isForeign: true as const,
    }));
  }, [relationData]);

  // Tasks with no usable dates can't be drawn as a bar, but dropping them made
  // them invisible in this view (KFL-117). Split instead of filter: bars for
  // the scheduled ones, an "Unscheduled" group for the rest.
  const { scheduled: parsedTasks, unscheduled: unscheduledTasks } = useMemo(
    () => partitionTasksBySchedule([...filteredAllTasks, ...foreignRows]),
    [filteredAllTasks, foreignRows],
  );
  // Sort the flat task list before building the tree so parents/children
  // respect the selected sort within their subtree.
  // sortTasks() only reads shared fields (status/priority/dates/title), but is
  // typed against the full Task shape; these rows are a narrower projection.
  const sortedParsed = useMemo(
    () =>
      sortTasks(
        parsedTasks as unknown as Task[],
        sort,
      ) as unknown as typeof parsedTasks,
    [parsedTasks, sort],
  );

  // Nest subtasks under parents; flatten with depth.
  const nestedRows = useMemo(
    () => buildNestedRows(sortedParsed, relationData?.relations ?? []),
    [sortedParsed, relationData?.relations],
  );

  // When searching, expand all (ignore collapse) so results are visible.
  const searching = searchQuery.trim().length > 0;
  const visibleRows = useMemo(() => {
    if (searching) return nestedRows;
    return applyCollapsed(nestedRows, collapsedIds);
  }, [nestedRows, collapsedIds, searching]);

  const scheduledTasks = useMemo(() => {
    if (!searching) return visibleRows;
    return visibleRows.filter((task) =>
      matchesTaskQuery(task, searchQuery, board?.slug),
    );
  }, [visibleRows, searching, board?.slug, searchQuery]);
  const matchingTaskIds = useMemo(
    () =>
      new Set(
        filteredAllTasks
          .filter((task) => matchesTaskQuery(task, searchQuery, board?.slug))
          .map((task) => task.id),
      ),
    [filteredAllTasks, searchQuery, board?.slug],
  );
  const visibleMilestones = useMemo(
    () =>
      ganttMilestones.filter((milestone) =>
        milestoneMatchesQuery(milestone, searchQuery, matchingTaskIds),
      ),
    [ganttMilestones, searchQuery, matchingTaskIds],
  );

  /**
   * Milestone sections: each milestone is a header with its member tasks
   * directly beneath it, and the remainder falls into a trailing ungrouped
   * section. Searching force-expands so matches can't hide inside a collapsed
   * section, mirroring how subtask collapse already behaves.
   */
  const sections = useMemo(
    () =>
      buildGanttSections({
        rows: scheduledTasks,
        milestones: visibleMilestones,
        collapsedMilestoneIds: searching
          ? new Set<string>()
          : collapsedMilestoneIds,
      }),
    [scheduledTasks, visibleMilestones, collapsedMilestoneIds, searching],
  );
  const toggleMilestone = useCallback((milestoneId: string) => {
    setCollapsedMilestoneIds((current) => {
      const next = new Set(current);
      if (next.has(milestoneId)) next.delete(milestoneId);
      else next.add(milestoneId);
      return next;
    });
  }, []);

  // Unscheduled tasks are a flat lane — no nesting, no collapse, they have no
  // bars to relate to. They obey sort and search like every other row.
  const unscheduledRows = useMemo<FlatRow[]>(() => {
    const sorted = sortTasks(
      unscheduledTasks as unknown as Task[],
      sort,
    ) as unknown as ScheduledTask[];
    return sorted
      .filter((task) => matchesTaskQuery(task, searchQuery, board?.slug))
      .map((task) => ({
        ...task,
        depth: 0,
        hasChildren: false,
        parentId: null,
      }));
  }, [unscheduledTasks, sort, searchQuery, board?.slug]);

  // Deferred so navigation into this view paints immediately. React renders the
  // shell (toolbar, header, skeleton) with the previous/empty list, then renders
  // the real rows in a low-priority pass — the click no longer blocks on 185
  // rows of layout. `isStale` is what drives the skeleton below.
  // Rows are grouped into milestone sections first, so the deferred value must
  // be the SECTION rows — deferring the ungrouped list would render tasks that
  // a collapsed section is meant to hide.
  const deferredSections = useDeferredValue(sections);
  const deferredRows = useMemo(
    () => visibleSectionRows(deferredSections),
    [deferredSections],
  );
  // Dependency arrows are drawn between bars, so only rows that actually have
  // both dates can participate. Narrow with a guard instead of casting: the
  // unscheduled lane deliberately carries rows with no dates at all.
  const arrowRows = useMemo(
    () =>
      deferredRows.filter(
        (row): row is ScheduledFlatRow =>
          row.scheduleStart instanceof Date && row.scheduleEnd instanceof Date,
      ),
    [deferredRows],
  );
  const rowsAreStale = deferredSections !== sections;
  /**
   * Manual order can only be honoured when the view is showing manual order.
   * Same rule the board/list views apply (`disableDragDrop={sort.field !==
   * "position"}`) — dragging under a title/date sort would save a position the
   * user never sees, so the gesture is disabled instead of lying.
   */
  const dragDropEnabled = sort.field === "position";
  const collisionRows = useMemo(
    () => (drag ? removeChildrenOf(deferredRows, drag.activeId) : deferredRows),
    [deferredRows, drag],
  );
  const dragProjection = useMemo(() => {
    if (!drag) return null;
    return planGanttTaskDrop({
      rows: nestedRows,
      relations: relationData?.relations ?? [],
      maxNestDepth: board?.subtaskDepthLimit,
      activeId: drag.activeId,
      overId: drag.overId,
      deltaX: drag.deltaX,
      previousDragDepth: drag.dragDepth,
    });
  }, [board?.subtaskDepthLimit, drag, nestedRows, relationData?.relations]);

  const finishDrag = useCallback(
    async (event: DragEndEvent) => {
      const preservedScrollLeft = scrollRef.current?.scrollLeft ?? 0;
      const activeId = event.active.id.toString();
      const overId = event.over?.id.toString();
      const deltaX = event.delta.x;
      // Drop with the SAME intent-box level the preview settled on, otherwise
      // the committed nesting can disagree with what the user just saw.
      const previousDragDepth = drag?.dragDepth ?? 0;
      setDrag(null);
      if (!overId || !board) return;
      const plan = planGanttTaskDrop({
        rows: nestedRows,
        relations: relationData?.relations ?? [],
        activeId,
        overId,
        deltaX,
        maxNestDepth: board.subtaskDepthLimit,
        previousDragDepth,
      });
      if (!plan) return;

      const reordered = applyGanttOrder(board, plan.orderedIds);
      setDropPending(true);
      try {
        await reorderTasks({
          boardId,
          board: reordered.board,
          tasks: reordered.updates,
        });
        if (plan.deleteRelationId)
          await deleteTaskRelation(plan.deleteRelationId);
        if (plan.createRelation) await createTaskRelation(plan.createRelation);
        const affected = [activeId, plan.parentId].filter(Boolean) as string[];
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["board-task-relations", boardId],
          }),
          ...affected.map((id) =>
            queryClient.invalidateQueries({ queryKey: ["task-relations", id] }),
          ),
        ]);
      } finally {
        requestAnimationFrame(() => {
          if (scrollRef.current)
            scrollRef.current.scrollLeft = preservedScrollLeft;
        });
        setDropPending(false);
      }
    },
    [
      board,
      boardId,
      createTaskRelation,
      deleteTaskRelation,
      drag?.dragDepth,
      nestedRows,
      queryClient,
      relationData?.relations,
      reorderTasks,
    ],
  );

  const timeline = useMemo(() => {
    const milestoneDates = milestoneTimelineDates(ganttMilestones);
    // A board of only-unscheduled tasks still needs a grid to hang rows off,
    // otherwise the whole view falls back to the empty state and the tasks
    // disappear again. Anchor that grid on today.
    if (parsedTasks.length === 0 && milestoneDates.length === 0) {
      if (unscheduledTasks.length === 0) return null;
      const today = startOfDay(new Date());
      return buildTimeline({
        earliest: today,
        latest: today,
        zoom,
        isMobile,
        weekStartsOn,
      });
    }
    const dates = [
      ...parsedTasks.flatMap((task) => [task.scheduleStart, task.scheduleEnd]),
      ...milestoneDates,
    ];
    const earliest = dates.reduce((current, date) =>
      date < current ? date : current,
    );
    const latest = dates.reduce((current, date) =>
      date > current ? date : current,
    );
    return buildTimeline({
      earliest,
      latest,
      zoom,
      isMobile,
      weekStartsOn,
    });
  }, [
    parsedTasks,
    unscheduledTasks.length,
    ganttMilestones,
    zoom,
    isMobile,
    weekStartsOn,
  ]);

  useLayoutEffect(() => {
    const element = timelineTrackRef.current;
    if (!element || !timeline) return;
    const update = () => {
      const count = timeline.days.length;
      if (count <= 0) return;
      setPixelsPerDay(element.clientWidth / count);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [timeline]);

  const hasAutoScrolled = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !timeline || hasAutoScrolled.current || pixelsPerDay <= 0)
      return;
    const todayOffsetPx =
      (dayOffsetRem(startOfDay(new Date()), timeline) / timeline.dayWidthRem) *
      pixelsPerDay;
    const railPx = showTaskRail
      ? isMobile
        ? taskColumnWidthRem * 16
        : 320
      : 0;
    const target = todayOffsetPx + railPx - scroller.clientWidth / 3;
    scroller.scrollLeft = Math.max(0, target);
    hasAutoScrolled.current = true;
  }, [timeline, pixelsPerDay, showTaskRail, isMobile, taskColumnWidthRem]);

  const todayLeftRem = timeline
    ? dayOffsetRem(startOfDay(new Date()), timeline)
    : 0;
  const todayInRange =
    timeline &&
    todayLeftRem >= 0 &&
    todayLeftRem < timeline.timelineMinWidthRem;

  const railWidthRem = isMobile ? taskColumnWidthRem : 20;
  const timelineLeft = showTaskRail ? `${railWidthRem}rem` : "0rem";

  const openTask = useCallback(
    (task: FlatRow) => {
      if (task.isForeign) {
        navigate({
          to: "/dashboard/organization/$organizationSlug/board/$boardSlug/gantt",
          params: {
            organizationSlug: organizationSlug ?? "",
            boardSlug: task.boardSlug ?? task.boardId,
          },
          search: { taskId: task.id },
        });
      } else {
        navigate({ to: ".", search: { taskId: task.id }, replace: true });
      }
    },
    [navigate, organizationSlug],
  );

  // Month header: group timeline.days into month spans for a row above the day numbers.
  const monthSpans = useMemo(() => {
    if (!timeline) return [];
    const spans: { label: string; span: number; key: string }[] = [];
    for (const [i, day] of timeline.days.entries()) {
      const prev = timeline.days[i - 1];
      if (!prev || !isSameMonth(day, prev)) {
        spans.push({
          label: format(day, "MMMM yyyy"),
          span: 1,
          key: day.toISOString(),
        });
      } else {
        spans[spans.length - 1].span += 1;
      }
    }
    return spans;
  }, [timeline]);

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="gantt"
    >
      <PageTitle
        title={t("tasks:gantt.pageTitle", { name: board?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border/80 px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-3">
            <BoardToolbar
              board={board}
              filters={filters}
              updateFilter={updateFilter}
              updateLabelFilter={updateLabelFilter}
              clearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              users={orgMembers}
              organizationLabels={organizationLabels}
              sort={sort}
              onSortChange={setSort}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              groupBy={group}
              onGroupByChange={setGroup}
              filtersOnly
            />
            <div className="relative w-full max-w-[14rem]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("tasks:gantt.searchPlaceholder")}
                className="h-7 min-h-0 [&_[data-slot=input]]:pl-7 [&_[data-slot=input]]:text-xs"
              />
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
              <TaskViewControls
                sort={sort}
                onSortChange={setSort}
                group={group}
                onGroupChange={setGroup}
                display={display}
                onDisplayChange={setDisplay}
              />
              <div className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5">
                {ZOOM_LEVELS.map((level) => (
                  <Button
                    key={level}
                    variant={zoom === level ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => {
                      setZoom(level);
                      hasAutoScrolled.current = false;
                    }}
                    className={cn(
                      "h-5 rounded-md px-2 text-xs",
                      zoom !== level && "text-muted-foreground",
                    )}
                  >
                    {t(`tasks:gantt.zoom.${level}`)}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="xs"
                className="min-h-9 shrink-0 touch-manipulation sm:hidden"
                onClick={() => setIsTaskRailOpen((current) => !current)}
              >
                {showTaskRail ? (
                  <ChevronLeft className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
                {showTaskRail
                  ? t("tasks:gantt.hideTasks")
                  : t("tasks:gantt.showTasks")}
              </Button>
            </div>
            <div className="shrink-0">
              <CreateTaskAction boardId={boardId} />
            </div>
          </div>
        </div>

        {!timeline ||
        (parsedTasks.length === 0 &&
          unscheduledTasks.length === 0 &&
          ganttMilestones.length === 0) ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.noTasks")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:gantt.noTasksSubtitle")}
              </p>
            </div>
          </div>
        ) : scheduledTasks.length === 0 &&
          unscheduledRows.length === 0 &&
          visibleMilestones.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.noTasksFound")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:gantt.noTasksMatch", { query: searchQuery })}
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            aria-busy={dropPending}
            className={cn(
              "min-h-0 flex-1 overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
              // Showing the previous board's rows while the new ones load.
              isPlaceholderData && "pointer-events-none opacity-50",
              dropPending && "pointer-events-none",
            )}
          >
            {/*
              Saving indicator is a toast (PendingSyncIndicator below): the
              old sticky pill rendered INSIDE this scroll container, occupied
              layout space, and jolted the rows on every drag-save.
            */}
            <PendingSyncIndicator label="Saving move…" pending={dropPending} />
            <div className="relative min-w-max touch-pan-x touch-pan-y">
              {/* Sticky header: month row + day row */}
              <div className="sticky top-0 z-20 bg-background/95 backdrop-blur">
                <div className="flex border-b border-border">
                  {showTaskRail ? (
                    <div
                      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background px-2 py-1 sm:w-80 sm:px-3"
                      style={{
                        width: isMobile
                          ? `${taskColumnWidthRem}rem`
                          : undefined,
                      }}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("tasks:gantt.taskHeader")}
                      </p>
                    </div>
                  ) : null}
                  {/* Month span row */}
                  <div
                    className="grid shrink-0"
                    style={{
                      gridTemplateColumns: timeline.gridTemplateColumns,
                      minWidth: `${timeline.timelineMinWidthRem}rem`,
                    }}
                  >
                    {monthSpans.map((ms) => (
                      <div
                        key={ms.key}
                        style={{ gridColumn: `span ${ms.span}` }}
                        className="border-r border-border/50 px-1 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        {ms.label}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Day row */}
                <div className="flex border-b border-border">
                  {showTaskRail ? (
                    <div
                      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background sm:w-80"
                      style={{
                        width: isMobile
                          ? `${taskColumnWidthRem}rem`
                          : undefined,
                      }}
                    />
                  ) : null}
                  <div
                    className="grid shrink-0"
                    style={{
                      gridTemplateColumns: timeline.gridTemplateColumns,
                      minWidth: `${timeline.timelineMinWidthRem}rem`,
                    }}
                  >
                    {timeline.headerCells.map((cell) => {
                      const cellDate = new Date(cell.key);
                      return (
                        <div
                          key={cell.key}
                          style={{ gridColumn: `span ${cell.span}` }}
                          className={cn(
                            "border-r border-border/70 px-0.5 py-0.5 text-center sm:px-1",
                            zoom === "day" &&
                              isWeekend(cellDate) &&
                              "bg-muted/25",
                          )}
                        >
                          <div className="h-3 truncate text-[10px] font-medium text-muted-foreground">
                            {cell.label}
                          </div>
                          <div
                            className={cn(
                              "mx-auto flex h-4 min-w-4 items-center justify-center truncate rounded-full px-1 text-[10px] font-medium",
                              zoom === "day" &&
                                isToday(cellDate) &&
                                "bg-primary text-primary-foreground",
                            )}
                          >
                            {cell.sublabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="relative">
                {/* Grid background: one gradient-painted div instead of one
                    element per day. Day columns are a repeating gradient; the
                    weekend tint is a second gradient with a 7-day period
                    anchored to the first weekend in range. */}
                <div
                  ref={timelineTrackRef}
                  aria-hidden="true"
                  className="absolute inset-y-0 z-0"
                  style={{
                    left: timelineLeft,
                    width: `${timeline.timelineMinWidthRem}rem`,
                    /*
                      #163: the grid used to be painted only at day zoom, so
                      switching zoom made it vanish and reappear — read as
                      blinking. The gradients are driven by `dayWidthRem`, which
                      is valid at every zoom, so paint them unconditionally.
                    */
                    backgroundImage: [
                      weekendTintGradient(timeline),
                      gridLineGradient(timeline),
                    ]
                      .filter(Boolean)
                      .join(", "),
                  }}
                />

                {/* Today line */}
                {todayInRange ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 z-[6] w-px bg-primary/70"
                    style={{
                      left: `calc(${timelineLeft} + ${todayLeftRem + timeline.dayWidthRem / 2}rem)`,
                    }}
                  >
                    {/* KFL-212: small handle badge at the top so "today" is
                        findable and clickable as a scroll target. */}
                    <button
                      type="button"
                      aria-label={t("tasks:gantt.today")}
                      className="pointer-events-auto absolute -top-px -left-1 flex h-4 w-2 items-center justify-center rounded-b-sm bg-primary"
                      onClick={() => {
                        const scroller = scrollRef.current;
                        if (!scroller) return;
                        const todayOffsetPx =
                          (todayLeftRem + timeline.dayWidthRem / 2) * 16;
                        scroller.scrollLeft = Math.max(
                          0,
                          todayOffsetPx - scroller.clientWidth / 3,
                        );
                      }}
                    >
                      <div className="h-2 w-px bg-primary-foreground/70" />
                    </button>
                  </div>
                ) : null}

                {/* Dependency arrows (blocks/related only) */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-[5]"
                  style={{
                    left: timelineLeft,
                    width: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  <GanttDependencyArrows
                    relations={relationData?.relations ?? []}
                    rows={arrowRows}
                    timeline={timeline}
                    rowHeightPx={ROW_HEIGHT_PX}
                    pixelsPerDay={pixelsPerDay}
                  />
                </div>

                {/* Rows. Dimmed while a deferred render is in flight so the
                    view reads as "working" instead of frozen. */}
                <div
                  className={cn(
                    "relative z-10 flex flex-col",
                    rowsAreStale && "opacity-60 transition-opacity",
                  )}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    /*
                      dnd-kit's auto-scroll inspects the full sortable row. Our
                      row spans the sticky task rail AND the wide timeline grid,
                      while its activator lives in `sticky left-0`. During a held
                      drag the library therefore sees the dragged rectangle at
                      the scroller's left edge and repeatedly drives scrollLeft
                      toward zero — even when the pointer has not moved there.

                      Disable library auto-scroll for this vertical rail reorder.
                      The timeline remains manually scrollable, and finishDrag
                      still restores the exact viewport after async persistence.
                    */
                    autoScroll={false}
                    onDragStart={(event: DragStartEvent) => {
                      const id = event.active.id.toString();
                      setDrag({
                        activeId: id,
                        overId: id,
                        deltaX: 0,
                        dragDepth: 0,
                      });
                    }}
                    onDragMove={(event: DragMoveEvent) =>
                      setDrag((current) =>
                        current
                          ? {
                              ...current,
                              deltaX: event.delta.x,
                              // Advance the intent box from its PREVIOUS level so
                              // the dead zone has hysteresis instead of snapping
                              // at the midpoint on every wobble.
                              dragDepth: getDragDepth(
                                event.delta.x,
                                INDENTATION_WIDTH_PX,
                                current.dragDepth,
                              ),
                            }
                          : current,
                      )
                    }
                    onDragOver={(event) =>
                      setDrag((current) =>
                        current && event.over
                          ? { ...current, overId: event.over.id.toString() }
                          : current,
                      )
                    }
                    onDragCancel={() => setDrag(null)}
                    onDragEnd={finishDrag}
                  >
                    <SortableContext
                      items={collisionRows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {/* Milestone sections: header, then that milestone's own
                          tasks, then the ungrouped remainder last. Sections live
                          INSIDE the SortableContext so a task can still be
                          dragged across section boundaries. */}
                      {deferredSections.map((section) => {
                        const sectionKey =
                          section.kind === "milestone"
                            ? `milestone-${section.milestone.id}`
                            : "ungrouped";
                        return (
                          <Fragment key={sectionKey}>
                            {section.kind === "milestone" ? (
                              <GanttMilestoneRow
                                milestone={section.milestone}
                                timeline={timeline}
                                showTaskRail={showTaskRail}
                                taskColumnWidthRem={taskColumnWidthRem}
                                isMobile={isMobile}
                                collapsed={section.collapsed}
                                taskCount={section.rows.length}
                                onToggleCollapse={toggleMilestone}
                              />
                            ) : section.labelled ? (
                              <div
                                className="grid h-9 items-stretch border-y border-border bg-muted/35"
                                data-testid="gantt-no-milestone-section"
                                style={{
                                  gridTemplateColumns: showTaskRail
                                    ? isMobile
                                      ? `${taskColumnWidthRem}rem max-content`
                                      : "20rem max-content"
                                    : "max-content",
                                }}
                              >
                                {showTaskRail ? (
                                  <div className="sticky left-0 z-[13] flex items-center border-r border-border bg-card px-3 text-xs font-semibold">
                                    {t("tasks:gantt.noMilestoneGroup")}
                                  </div>
                                ) : null}
                                <div
                                  style={{
                                    minWidth: `${timeline.timelineMinWidthRem}rem`,
                                  }}
                                />
                              </div>
                            ) : null}
                            {section.kind === "milestone" && section.collapsed
                              ? null
                              : section.rows.map((task) => (
                                  <GanttRow
                                    key={task.id}
                                    task={task}
                                    timeline={timeline}
                                    pixelsPerDay={pixelsPerDay}
                                    isMobile={isMobile}
                                    showTaskRail={showTaskRail}
                                    taskColumnWidthRem={taskColumnWidthRem}
                                    boardSlug={board?.slug}
                                    collapsed={collapsedIds.has(task.id)}
                                    display={display}
                                    unscheduledHint={t(
                                      "tasks:gantt.unscheduledHint",
                                    )}
                                    onToggleCollapse={toggleCollapse}
                                    onOpenTask={openTask}
                                    sortable={dragDropEnabled}
                                    projectedDepth={
                                      drag?.activeId === task.id
                                        ? dragProjection?.depth
                                        : undefined
                                    }
                                    prospectiveParent={
                                      dragProjection?.parentId === task.id
                                    }
                                  />
                                ))}
                          </Fragment>
                        );
                      })}
                    </SortableContext>
                  </DndContext>

                  {/* Unscheduled lane. Same rows, no bars — a labelled divider
                      keeps them from reading as an unexplained gap at the top
                      of the grid. */}
                  {unscheduledRows.length > 0 ? (
                    <>
                      {/*
                        #152: the section header sticks to the left AND to the
                        top of the scroll area, and toggles its rows. It was
                        only `sticky left-0`, so it scrolled out of view
                        vertically and could not be collapsed.

                        The header also sits ON TOP of the scrolling grid, so its
                        background must stay fully opaque. `--accent` is a 6%
                        alpha tint (see #162), so `hover:bg-accent` REPLACED the
                        opaque `bg-card` with a near-transparent wash and the
                        grid lines showed straight through on hover. Keep
                        `bg-card` and layer the hover tint as a pseudo-element on
                        top instead.
                      */}
                      <button
                        type="button"
                        aria-expanded={!unscheduledCollapsed}
                        data-testid="gantt-section-unscheduled"
                        onClick={() => setUnscheduledCollapsed((open) => !open)}
                        className="sticky top-0 z-[14] flex w-full items-center border-y border-border bg-card py-1 text-left before:pointer-events-none before:absolute before:inset-0 before:bg-accent before:opacity-0 hover:before:opacity-100"
                        style={{ width: showTaskRail ? undefined : "100%" }}
                      >
                        {/*
                          #152 (round 2): the BAR spans the full timeline width,
                          so `sticky left-0` on it has nothing to stick within —
                          the label scrolled off with the grid. The label is now
                          its own sticky box pinned to the task-column width, so
                          it stays frozen at the left edge while the timeline
                          scrolls underneath.
                        */}
                        <span
                          className="sticky left-0 z-[1] flex shrink-0 items-center gap-2 bg-card px-3"
                          style={
                            showTaskRail
                              ? { width: `${taskColumnWidthRem}rem` }
                              : undefined
                          }
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              "size-3 shrink-0 text-muted-foreground transition-transform",
                              unscheduledCollapsed && "-rotate-90",
                            )}
                          />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("tasks:gantt.unscheduledGroup")}
                          </span>
                          <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium text-secondary-foreground">
                            {unscheduledRows.length}
                          </span>
                        </span>
                      </button>
                      {!unscheduledCollapsed &&
                        unscheduledRows.map((task) => (
                          <GanttRow
                            key={task.id}
                            task={task}
                            timeline={timeline}
                            pixelsPerDay={pixelsPerDay}
                            isMobile={isMobile}
                            showTaskRail={showTaskRail}
                            taskColumnWidthRem={taskColumnWidthRem}
                            boardSlug={board?.slug}
                            collapsed={false}
                            display={display}
                            unscheduledHint={t("tasks:gantt.unscheduledHint")}
                            onToggleCollapse={toggleCollapse}
                            onOpenTask={openTask}
                          />
                        ))}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={() => navigate({ to: ".", search: {}, replace: true })}
        />
      </div>
    </BoardLayout>
  );
}
