import { differenceInCalendarDays, format, isToday, parseISO } from "date-fns";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Diamond,
  Filter,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildTimeline,
  dayOffsetRem,
  type GanttZoom,
  gridLineGradient,
  weekendTintGradient,
} from "@/components/gantt/gantt-timeline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import icons from "@/constants/board-icons";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import {
  buildOverviewTimelineSections,
  type OverviewTimelineTask,
} from "./boards-timeline-sections";

/** Only the board fields the timeline needs, so callers can pass their own shape. */
export type TimelineBoard = {
  id: string;
  name: string;
  icon?: string | null;
  statistics?: {
    totalTasks?: number;
    completionPercentage?: number;
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
  } | null;
  /** Present only when the overview caller already has board tasks available. */
  tasks?: OverviewTimelineTask[];
  /** Set when the board is archived; archived boards always render last. */
  archivedAt?: string | Date | null;
};

type ScheduledBoard = {
  board: TimelineBoard;
  start: Date;
  end: Date;
};

/**
 * Only the milestone fields the timeline needs. Deliberately a local structural
 * type rather than the API's `Milestone`: the overview renders one diamond per
 * milestone and nothing else, so callers can map whatever shape they already
 * hold (board-scoped fetch, aggregated endpoint, tests) without this component
 * depending on a fetcher.
 */
export type TimelineMilestone = {
  id: string;
  name: string;
  status: string;
  dueDate?: string | Date | null;
};

/**
 * Diamond tint by milestone status, matching `gantt-milestone-row.tsx` so a
 * milestone reads the same colour in the board Gantt and the boards overview.
 * Unknown/custom statuses fall back to `planned` rather than rendering
 * uncoloured.
 */
const MILESTONE_STATUS_CLASSES: Record<string, string> = {
  planned: "text-violet-500",
  active: "text-indigo-500",
  completed: "text-emerald-500",
  archived: "text-muted-foreground",
};

/**
 * The user-facing zoom levels, coarsest last. The labels describe the span a
 * screenful covers, which is not the same thing as the underlying column
 * grouping: `GanttZoom` names its levels after how days are *grouped*
 * ("day" columns, week-grouped, month-grouped), so the finest level shows about
 * a week at a time and is labelled "Week". Mapping is kept here rather than
 * renaming anything in gantt-timeline.ts, which the board Gantt shares.
 */
const ZOOM_OPTIONS: { zoom: GanttZoom; key: string; fallback: string }[] = [
  { zoom: "day", key: "week", fallback: "Week" },
  { zoom: "week", key: "month", fallback: "Month" },
  { zoom: "month", key: "year", fallback: "Year" },
];

/** Keeps the board-name column pinned while the timeline scrolls sideways. */
const STICKY_NAME_COLUMN = "sticky left-0 z-20 w-56 shrink-0 bg-background";

const DEFAULT_ZOOM: GanttZoom = ZOOM_OPTIONS[1].zoom;

type BoardStatus = "notStarted" | "inProgress" | "complete";

const STATUS_OPTIONS: { status: BoardStatus; key: string; fallback: string }[] =
  [
    { status: "notStarted", key: "not-started", fallback: "Not started" },
    { status: "inProgress", key: "in-progress", fallback: "In progress" },
    { status: "complete", key: "complete", fallback: "Complete" },
  ];

function getBoardStatus(board: TimelineBoard): BoardStatus {
  const total = board.statistics?.totalTasks ?? 0;
  const percent = board.statistics?.completionPercentage ?? 0;
  if (total === 0) return "notStarted";
  return percent === 100 ? "complete" : "inProgress";
}

/** Mirrors the boards table: icon is a lucide name, with Layout as fallback. */
function BoardIcon({ icon }: { icon?: string | null }) {
  const Icon = icons[icon as keyof typeof icons] ?? icons.Layout;
  return <Icon className="mr-1.5 inline size-3.5 align-[-2px]" />;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? parseISO(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Boards on a timeline, reusing the board Gantt's own timeline maths
 * (`buildTimeline`, the grid/weekend gradients, `dayOffsetRem`) so the two views
 * scale, tint and align identically. Each board spans its earliest task start to
 * its latest task due date, computed server-side in `getBoards`.
 *
 * Read-only by design: a board's span is derived from its tasks, so dragging a
 * board bar has no single obvious meaning. Editing stays in the board Gantt.
 *
 * Milestones are marked as diamonds on their due-date column when the caller
 * supplies `milestonesByBoardId`; this component does not fetch them.
 */
export default function BoardsTimeline({
  boards,
  milestonesByBoardId,
  zoom: initialZoom = DEFAULT_ZOOM,
  weekStartsOn = 1,
  onBoardClick,
}: {
  boards: TimelineBoard[];
  /**
   * Milestones to mark on each board's row, keyed by board id. Optional and
   * presentational: this component never fetches. Milestones are per-board, so
   * a hook per row would break the rules of hooks and fan out N+1 requests —
   * the caller aggregates once and passes the map down. Omitted means no
   * diamonds, which is why existing callers keep working unchanged.
   */
  milestonesByBoardId?: Record<string, TimelineMilestone[]>;
  /** Starting zoom; the control below owns it from the first click onwards. */
  zoom?: GanttZoom;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onBoardClick: (boardId: string) => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [zoom, setZoom] = useState<GanttZoom>(initialZoom);
  const [statusFilters, setStatusFilters] = useState<BoardStatus[]>([]);
  const [expandedBoardIds, setExpandedBoardIds] = useState<string[]>([]);
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([]);

  const scheduled = useMemo<ScheduledBoard[]>(() => {
    return (
      boards
        .map((board) => {
          const start = toDate(board.statistics?.startsAt);
          const end = toDate(board.statistics?.endsAt);
          if (!start || !end) return null;
          // Inverted data means the board's own task dates disagree; rendering it
          // would place a bar at a misleading position, so drop it the same way an
          // undated board is dropped. Equal dates are fine — a single-day bar.
          if (end < start) return null;
          return { board, start, end };
        })
        .filter((entry): entry is ScheduledBoard => entry !== null)
        /*
        KFL-190: the boards list arrives archived-last from the server, and this
        chronological re-sort used to undo that whenever an archived board
        started earliest. Archival is compared first so it survives the local
        sort; start date still orders each group.
      */
        .sort((a, b) => {
          const aArchived = a.board.archivedAt != null ? 1 : 0;
          const bArchived = b.board.archivedAt != null ? 1 : 0;
          if (aArchived !== bArchived) return aArchived - bArchived;
          return a.start.getTime() - b.start.getTime();
        })
    );
  }, [boards]);

  const filteredScheduled = useMemo(
    () =>
      statusFilters.length === 0
        ? scheduled
        : scheduled.filter(({ board }) =>
            statusFilters.includes(getBoardStatus(board)),
          ),
    [scheduled, statusFilters],
  );

  const timeline = useMemo(() => {
    if (scheduled.length === 0) return null;
    let earliest = scheduled[0].start;
    let latest = scheduled[0].end;
    for (const entry of scheduled) {
      if (entry.start < earliest) earliest = entry.start;
      if (entry.end > latest) latest = entry.end;
    }
    return buildTimeline({ earliest, latest, zoom, isMobile, weekStartsOn });
  }, [scheduled, zoom, isMobile, weekStartsOn]);

  if (scheduled.length === 0 || !timeline) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center"
        data-testid="boards-timeline-empty"
      >
        <CalendarRange className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">
          {t("organization:boards.timeline.emptyTitle", {
            defaultValue: "No scheduled boards",
          })}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t("organization:boards.timeline.emptyDescription", {
            defaultValue:
              "Boards appear here once their tasks have start or due dates.",
          })}
        </p>
      </div>
    );
  }

  const weekendTint = weekendTintGradient(timeline);
  const todayOffset = timeline.days.some((day) => isToday(day))
    ? dayOffsetRem(new Date(), timeline)
    : null;

  return (
    <TooltipProvider delay={0} closeDelay={0}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent/60"
            data-testid="boards-timeline-expand-all"
            onClick={() => {
              const boardIds = filteredScheduled.map(({ board }) => board.id);
              setExpandedBoardIds(boardIds);
              const sectionIds: string[] = [];
              for (const { board } of filteredScheduled) {
                const sections = buildOverviewTimelineSections(
                  board.tasks ?? [],
                  milestonesByBoardId?.[board.id] ?? [],
                );
                for (const section of sections) {
                  sectionIds.push(
                    section.kind === "milestone"
                      ? `${board.id}-${section.milestone.id}`
                      : `${board.id}-unscheduled`,
                  );
                }
              }
              setExpandedSectionIds(sectionIds);
            }}
            type="button"
          >
            {t("organization:boards.timeline.expandAll", {
              defaultValue: "Expand all",
            })}
          </button>
          <button
            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent/60"
            data-testid="boards-timeline-collapse-all"
            onClick={() => {
              setExpandedBoardIds([]);
              setExpandedSectionIds([]);
            }}
            type="button"
          >
            {t("organization:boards.timeline.collapseAll", {
              defaultValue: "Collapse all",
            })}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label={t("common:actions.filter", {
                    defaultValue: "Filter",
                  })}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent/60"
                  data-testid="boards-timeline-filter"
                  type="button"
                />
              }
            >
              <Filter className="size-3" />
              {t("common:actions.filter", { defaultValue: "Filter" })}
              {statusFilters.length > 0 ? ` (${statusFilters.length})` : null}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                  {t("tasks:boardFilters.subjects.status", {
                    defaultValue: "Status",
                  })}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="boards-timeline-filter-all"
                onClick={() => setStatusFilters([])}
              >
                All statuses
              </DropdownMenuItem>
              {STATUS_OPTIONS.map((option) => {
                const selected = statusFilters.includes(option.status);
                return (
                  <DropdownMenuItem
                    data-testid={`boards-timeline-filter-${option.key}`}
                    key={option.status}
                    onClick={() =>
                      setStatusFilters((current) =>
                        selected
                          ? current.filter((status) => status !== option.status)
                          : [...current, option.status],
                      )
                    }
                  >
                    <span aria-hidden="true" className="w-4 text-center">
                      {selected ? "✓" : null}
                    </span>
                    {t(`organization:boards.timeline.status.${option.status}`, {
                      defaultValue: option.fallback,
                    })}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Zoom lives with the timeline itself, so any caller gets the control. */}
          <div
            className="inline-flex h-7 w-fit shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5"
            data-testid="boards-timeline-zoom"
          >
            {ZOOM_OPTIONS.map((option) => (
              <button
                aria-pressed={zoom === option.zoom}
                className={cn(
                  "h-5 rounded-md px-2 text-xs",
                  zoom === option.zoom
                    ? "bg-accent font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`boards-timeline-zoom-${option.key}`}
                key={option.key}
                onClick={() => setZoom(option.zoom)}
                type="button"
              >
                {t(`organization:boards.timeline.zoom.${option.key}`, {
                  defaultValue: option.fallback,
                })}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto" data-testid="boards-timeline">
          <div style={{ minWidth: `${timeline.timelineMinWidthRem + 14}rem` }}>
            {/* Header: same grouped cells as the board Gantt. */}
            <div className="flex border-b border-border">
              {/* Sticky so the names stay readable while the bars scroll sideways. */}
              <div
                className={cn(
                  STICKY_NAME_COLUMN,
                  "px-3 py-2 text-xs font-medium text-muted-foreground",
                )}
                data-testid="boards-timeline-name-header"
              >
                {t("organization:boards.timeline.boardColumn", {
                  defaultValue: "Board",
                })}
              </div>
              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
              >
                {timeline.headerCells.map((cell) => (
                  <div
                    className="border-l border-border/60 px-1 py-2 text-center"
                    key={cell.key}
                    style={{ gridColumn: `span ${cell.span}` }}
                  >
                    <div className="truncate text-[11px] font-medium">
                      {cell.label}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {cell.sublabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* Today marker spans every row, like the board Gantt. */}
              {todayOffset !== null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/70"
                  data-testid="boards-timeline-today"
                  style={{ left: `calc(14rem + ${todayOffset}rem)` }}
                />
              )}

              {filteredScheduled.map(({ board, start, end }) => {
                const expanded = expandedBoardIds.includes(board.id);
                const startIndex = differenceInCalendarDays(
                  start,
                  timeline.rangeStart,
                );
                const daySpan = differenceInCalendarDays(end, start) + 1;
                const total = board.statistics?.totalTasks ?? 0;
                const percent = board.statistics?.completionPercentage ?? 0;

                // A milestone with no due date has nowhere to sit, and one outside
                // the padded range would clamp onto the first/last column and lie
                // about when it is due. Both are dropped silently rather than
                // shown in the wrong place.
                const marks = (milestonesByBoardId?.[board.id] ?? []).flatMap(
                  (milestone) => {
                    const dueDate = toDate(milestone.dueDate);
                    if (!dueDate) return [];
                    const dayIndex = differenceInCalendarDays(
                      dueDate,
                      timeline.rangeStart,
                    );
                    if (dayIndex < 0 || dayIndex >= timeline.days.length)
                      return [];
                    return [{ milestone, dueDate, dayIndex }];
                  },
                );
                const sections = buildOverviewTimelineSections(
                  board.tasks ?? [],
                  milestonesByBoardId?.[board.id] ?? [],
                );

                return (
                  <Fragment key={board.id}>
                    <div className="flex border-b border-border/60 hover:bg-accent/30">
                      <div
                        className={cn(
                          STICKY_NAME_COLUMN,
                          "flex items-center truncate px-3 py-2 text-left text-sm outline-none hover:underline",
                        )}
                        data-testid={`boards-timeline-name-${board.id}`}
                        title={board.name}
                      >
                        <button
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Collapse" : "Expand"} ${board.name}`}
                          className="mr-1 inline-flex size-4 shrink-0 items-center justify-center"
                          data-testid={`boards-timeline-toggle-${board.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedBoardIds((current) =>
                              current.includes(board.id)
                                ? current.filter((id) => id !== board.id)
                                : [...current, board.id],
                            );
                          }}
                          type="button"
                        >
                          {expanded ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronRight className="size-3.5" />
                          )}
                        </button>
                        <button
                          className="flex min-w-0 items-center truncate text-left hover:underline"
                          onClick={() => onBoardClick(board.id)}
                          type="button"
                        >
                          <BoardIcon icon={board.icon} />
                          {board.name}
                        </button>
                      </div>
                      <div
                        className="relative grid flex-1 items-center py-2"
                        style={{
                          backgroundImage: [
                            weekendTint,
                            gridLineGradient(timeline),
                          ]
                            .filter(Boolean)
                            .join(", "),
                          gridTemplateColumns: timeline.gridTemplateColumns,
                        }}
                      >
                        <button
                          className={cn(
                            "relative z-[5] flex h-6 min-w-0 items-center gap-1.5 overflow-hidden rounded px-2.5",
                            "bg-primary/25 ring-1 ring-inset ring-primary/40 hover:bg-primary/35",
                          )}
                          data-testid={`boards-timeline-bar-${board.id}`}
                          onClick={() => onBoardClick(board.id)}
                          style={{
                            gridColumn: `${Math.max(1, startIndex + 1)} / span ${Math.max(1, daySpan)}`,
                            // Pinned to row 1 so milestone markers overlap the bar
                            // instead of grid pushing either onto a new row.
                            gridRow: 1,
                          }}
                          title={`${board.name} · ${format(start, "MMM d")} → ${format(end, "MMM d, yyyy")}`}
                          type="button"
                        >
                          {/* Completion fill: progress is inferred from the board's
                        tasks, so it belongs on the bar itself. */}
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 bg-primary/35"
                            style={{ width: `${percent}%` }}
                          />
                          {/* Sits above the completion fill, so it needs full
                        foreground contrast rather than muted. */}
                          <span className="relative truncate text-[11px] font-semibold text-foreground">
                            {total > 0
                              ? t("organization:boards.timeline.barLabel", {
                                  defaultValue:
                                    "{{percent}}% · {{count}} tasks",
                                  count: total,
                                  percent,
                                })
                              : board.name}
                          </span>
                        </button>
                        {/* Milestone markers: one diamond per milestone, sitting on
                      its due-date column IN THE SAME ROW as the board bar.

                      `gridRow: 1` is load-bearing. The bar and a marker often
                      claim overlapping columns, and grid resolves that conflict
                      by pushing the later item onto a new implicit row — which
                      made each diamond add its own row and inflate the row
                      height. Pinning every item to row 1 makes them overlap as
                      intended, and z-[6] clears the bar's z-[5] so the marker
                      stays visible on top of it.

                      The wrapper is pointer-events-none so the bar underneath
                      stays clickable everywhere except the icon itself. */}
                        {marks.map(({ milestone, dueDate, dayIndex }) => (
                          <div
                            className="pointer-events-none relative z-[6] flex justify-center self-center"
                            key={milestone.id}
                            style={{
                              gridColumn: `${dayIndex + 1}`,
                              gridRow: 1,
                            }}
                          >
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    aria-label={`${milestone.name} · ${format(dueDate, "MMM d, yyyy")} · ${milestone.status}`}
                                    className="pointer-events-auto inline-flex cursor-pointer items-center justify-center outline-none"
                                    data-testid={`boards-timeline-milestone-${board.id}-${milestone.id}`}
                                    onClick={() => onBoardClick(board.id)}
                                    title={`${milestone.name} · ${format(dueDate, "MMM d, yyyy")} · ${milestone.status}`}
                                    type="button"
                                  />
                                }
                              >
                                <Diamond
                                  className={cn(
                                    "size-3.5 fill-current stroke-[1.5] drop-shadow-sm",
                                    MILESTONE_STATUS_CLASSES[
                                      milestone.status.toLowerCase()
                                    ] ?? MILESTONE_STATUS_CLASSES.planned,
                                  )}
                                />
                              </TooltipTrigger>
                              <TooltipPopup>
                                <div className="flex flex-col gap-0.5 py-0.5">
                                  <span className="font-medium">
                                    {milestone.name}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t(
                                      "organization:boards.timeline.milestoneDue",
                                      {
                                        defaultValue: "Due {{date}}",
                                        date: format(dueDate, "MMM d, yyyy"),
                                      },
                                    )}
                                  </span>
                                  <span className="text-muted-foreground capitalize">
                                    {milestone.status}
                                  </span>
                                </div>
                              </TooltipPopup>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </div>
                    {expanded &&
                      sections.map((section) => {
                        const sectionId =
                          section.kind === "milestone"
                            ? `${board.id}-${section.milestone.id}`
                            : `${board.id}-unscheduled`;
                        const sectionExpanded =
                          expandedSectionIds.includes(sectionId);
                        const sectionLabel =
                          section.kind === "milestone"
                            ? section.milestone.name
                            : t(
                                "organization:boards.timeline.scheduledNoMilestone",
                                {
                                  defaultValue: "Scheduled without milestone",
                                },
                              );
                        return (
                          <Fragment key={sectionId}>
                            <div className="flex border-b border-border/40 bg-muted/20">
                              <div
                                className={cn(
                                  STICKY_NAME_COLUMN,
                                  "flex items-center truncate py-1.5 pl-7 pr-3 text-xs font-medium",
                                )}
                              >
                                <button
                                  aria-expanded={sectionExpanded}
                                  aria-label={`${sectionExpanded ? "Collapse" : "Expand"} ${sectionLabel}`}
                                  className="mr-1 inline-flex size-4 shrink-0 items-center justify-center"
                                  data-testid={`boards-timeline-section-toggle-${sectionId}`}
                                  onClick={() =>
                                    setExpandedSectionIds((current) =>
                                      current.includes(sectionId)
                                        ? current.filter(
                                            (id) => id !== sectionId,
                                          )
                                        : [...current, sectionId],
                                    )
                                  }
                                  type="button"
                                >
                                  {sectionExpanded ? (
                                    <ChevronDown className="size-3" />
                                  ) : (
                                    <ChevronRight className="size-3" />
                                  )}
                                </button>
                                <span className="truncate text-foreground">
                                  {sectionLabel}
                                </span>
                                <span className="ml-1.5 text-muted-foreground">
                                  ({section.tasks.length})
                                </span>
                              </div>
                              {(() => {
                                const validStarts: Date[] = [];
                                const validEnds: Date[] = [];
                                for (const task of section.tasks) {
                                  const s =
                                    toDate(task.startDate) ??
                                    toDate(task.dueDate);
                                  const e = toDate(task.dueDate) ?? s;
                                  if (s && e) {
                                    validStarts.push(s);
                                    validEnds.push(e);
                                  }
                                }
                                if (validStarts.length === 0) {
                                  return (
                                    <div
                                      className="relative grid flex-1 items-center py-1.5"
                                      style={{
                                        backgroundImage: [
                                          weekendTint,
                                          gridLineGradient(timeline),
                                        ]
                                          .filter(Boolean)
                                          .join(", "),
                                        gridTemplateColumns:
                                          timeline.gridTemplateColumns,
                                      }}
                                    />
                                  );
                                }
                                const sectionStart = validStarts.reduce(
                                  (a, b) => (a < b ? a : b),
                                );
                                const sectionEnd = validEnds.reduce((a, b) =>
                                  a > b ? a : b,
                                );
                                const sectionStartIndex =
                                  differenceInCalendarDays(
                                    sectionStart,
                                    timeline.rangeStart,
                                  );
                                const sectionSpan =
                                  differenceInCalendarDays(
                                    sectionEnd,
                                    sectionStart,
                                  ) + 1;
                                return (
                                  <div
                                    className="relative grid flex-1 items-center py-1.5"
                                    style={{
                                      backgroundImage: [
                                        weekendTint,
                                        gridLineGradient(timeline),
                                      ]
                                        .filter(Boolean)
                                        .join(", "),
                                      gridTemplateColumns:
                                        timeline.gridTemplateColumns,
                                    }}
                                  >
                                    <div
                                      className="flex h-5 items-center overflow-hidden rounded bg-primary/15 ring-1 ring-inset ring-primary/30"
                                      data-testid={`boards-timeline-section-bar-${sectionId}`}
                                      style={{
                                        gridColumn: `${Math.max(1, sectionStartIndex + 1)} / span ${Math.max(1, sectionSpan)}`,
                                        gridRow: 1,
                                      }}
                                      title={`${sectionLabel} · ${format(sectionStart, "MMM d")}${sectionEnd > sectionStart ? ` → ${format(sectionEnd, "MMM d, yyyy")}` : ""}`}
                                    >
                                      {sectionSpan > 3 && (
                                        <span className="truncate px-1.5 text-[10px] font-medium text-primary/80">
                                          {format(sectionStart, "MMM d")}
                                          {sectionEnd > sectionStart
                                            ? ` – ${format(sectionEnd, "MMM d")}`
                                            : ""}
                                        </span>
                                      )}
                                    </div>
                                    {section.kind === "milestone" &&
                                      (() => {
                                        const dueDate = toDate(
                                          section.milestone.dueDate,
                                        );
                                        if (!dueDate) return null;
                                        const dayIndex =
                                          differenceInCalendarDays(
                                            dueDate,
                                            timeline.rangeStart,
                                          );
                                        if (
                                          dayIndex < 0 ||
                                          dayIndex >= timeline.days.length
                                        )
                                          return null;
                                        return (
                                          <div
                                            className="pointer-events-none relative z-[6] flex justify-center self-center"
                                            style={{
                                              gridColumn: `${dayIndex + 1}`,
                                              gridRow: 1,
                                            }}
                                          >
                                            <Diamond
                                              aria-label={`${sectionLabel} milestone`}
                                              className={cn(
                                                "size-3.5 shrink-0 fill-current stroke-[1.5] drop-shadow-sm",
                                                MILESTONE_STATUS_CLASSES[
                                                  section.milestone.status.toLowerCase()
                                                ] ??
                                                  MILESTONE_STATUS_CLASSES.planned,
                                              )}
                                              data-testid={`boards-timeline-section-milestone-${sectionId}`}
                                            />
                                          </div>
                                        );
                                      })()}
                                  </div>
                                );
                              })()}
                            </div>
                            {sectionExpanded &&
                              section.tasks.map((task) => {
                                const taskStart =
                                  toDate(task.startDate) ??
                                  toDate(task.dueDate);
                                const taskEnd =
                                  toDate(task.dueDate) ?? taskStart;
                                if (
                                  !taskStart ||
                                  !taskEnd ||
                                  taskEnd < taskStart
                                )
                                  return null;
                                const taskStartIndex = differenceInCalendarDays(
                                  taskStart,
                                  timeline.rangeStart,
                                );
                                const taskSpan =
                                  differenceInCalendarDays(taskEnd, taskStart) +
                                  1;
                                return (
                                  <div
                                    className="flex border-b border-border/30"
                                    key={task.id}
                                  >
                                    <div
                                      className={cn(
                                        STICKY_NAME_COLUMN,
                                        "truncate py-1 pr-3 pl-12 text-xs text-muted-foreground",
                                      )}
                                    >
                                      <span className="truncate">
                                        {task.title}
                                      </span>
                                      <span className="ml-2 shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
                                        {format(taskStart, "MMM d")}
                                        {taskEnd > taskStart
                                          ? ` – ${format(taskEnd, "MMM d")}`
                                          : ""}
                                      </span>
                                    </div>
                                    <div
                                      className="relative grid flex-1 items-center py-1"
                                      style={{
                                        backgroundImage: [
                                          weekendTint,
                                          gridLineGradient(timeline),
                                        ]
                                          .filter(Boolean)
                                          .join(", "),
                                        gridTemplateColumns:
                                          timeline.gridTemplateColumns,
                                      }}
                                    >
                                      <div
                                        className="flex h-4 items-center overflow-hidden rounded bg-primary/25 px-1 ring-1 ring-inset ring-primary/40"
                                        data-testid={`boards-timeline-task-${board.id}-${task.id}`}
                                        style={{
                                          gridColumn: `${Math.max(1, taskStartIndex + 1)} / span ${Math.max(1, taskSpan)}`,
                                          gridRow: 1,
                                        }}
                                        title={`${task.title} · ${format(taskStart, "MMM d")}${taskEnd > taskStart ? ` → ${format(taskEnd, "MMM d, yyyy")}` : ""}`}
                                      >
                                        {taskSpan > 2 && (
                                          <span className="truncate text-[10px] font-medium text-primary">
                                            {format(taskStart, "MMM d")}
                                            {taskEnd > taskStart
                                              ? ` – ${format(taskEnd, "MMM d")}`
                                              : ""}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
