import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addMonths,
  addWeeks,
  addYears,
  endOfWeek as dateFnsEndOfWeek,
  startOfWeek as dateFnsStartOfWeek,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardToolbar from "@/components/board/board-toolbar";
import BoardLayout from "@/components/common/board-layout";
import TaskViewControls from "@/components/common/task-view-controls";
import { statusBarClasses } from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import CreateTaskAction from "@/components/task/create-task-action";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useTaskFiltersWithLabelsSupport } from "@/hooks/use-task-filters-with-labels-support";
import { cn } from "@/lib/cn";
import {
  type DisplayConfig,
  type GroupField,
  type SortConfig,
  sortTasks,
} from "@/lib/sort-tasks";
import { useUserPreferencesStore } from "@/store/user-preferences";

type CalendarSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/calendar",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): CalendarSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function parseTaskDate(value: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId, organizationSlug } = useBoardSlug();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: board } = useGetTasks(boardId);
  const { data: orgMembers } = useGetActiveOrganizationMembers(organizationId);
  const { data: organizationLabels = [] } =
    useGetLabelsByOrganization(organizationId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [calView, setCalView] = useState<"week" | "month" | "year">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [sort, setSort] = useState<SortConfig>({
    field: "position",
    direction: "asc",
  });
  const [group, setGroup] = useState<GroupField>("none");
  const [display, setDisplay] = useState<DisplayConfig>({
    assignee: true,
    priority: true,
    labels: false,
    dates: true,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const {
    filters,
    updateFilter,
    updateLabelFilter,
    clearFilters,
    hasActiveFilters,
  } = useTaskFiltersWithLabelsSupport(board, boardId, searchQuery);

  const openTask = (id: string) =>
    navigate({ to: ".", search: { taskId: id }, replace: true });

  const scheduledTasks = useMemo(() => {
    const tasks = [
      ...(board?.columns.flatMap((column) => column.tasks) ?? []),
      ...(board?.plannedTasks ?? []),
    ].filter((task) => {
      if (filters.status?.length && !filters.status.includes(task.status))
        return false;
      if (
        filters.priority?.length &&
        !filters.priority.includes(task.priority ?? "")
      )
        return false;
      if (
        filters.assignee?.length &&
        !filters.assignee.includes(task.userId ?? task.assigneeId ?? "")
      )
        return false;
      if (filters.dueDate?.length) {
        if (filters.dueDate.includes("no_due_date") && !task.dueDate)
          return true;
        if (!task.dueDate) return false;
      }
      if (
        filters.labels?.length &&
        !task.labels?.some((label) => filters.labels!.includes(label.id))
      )
        return false;
      if (
        searchQuery.trim() &&
        !task.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
    return sortTasks(tasks, sort)
      .map((task) => {
        const parsedStart =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const parsedEnd =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);
        if (!parsedStart || !parsedEnd) return null;
        return {
          ...task,
          scheduleStart: parsedStart <= parsedEnd ? parsedStart : parsedEnd,
          scheduleEnd: parsedEnd >= parsedStart ? parsedEnd : parsedStart,
        };
      })
      .filter((task): task is NonNullable<typeof task> => task !== null);
  }, [board, sort, filters, searchQuery]);

  // Grid days depend on the selected view mode.
  const gridDays = useMemo(() => {
    if (calView === "week") {
      return eachDayOfInterval({
        start: dateFnsStartOfWeek(cursor, { weekStartsOn }),
        end: dateFnsEndOfWeek(cursor, { weekStartsOn }),
      });
    }
    if (calView === "year") return [];
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn }),
    });
  }, [calView, cursor, weekStartsOn]);

  const weekdayLabels = useMemo(
    () => gridDays.slice(0, 7).map((day) => format(day, "EEEEEE")),
    [gridDays],
  );

  // A task appears on every day it spans, not just its due date.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof scheduledTasks>();
    for (const day of gridDays) {
      const key = day.toDateString();
      const hits = scheduledTasks.filter((task) =>
        isWithinInterval(day, {
          start: task.scheduleStart,
          end: task.scheduleEnd,
        }),
      );
      if (hits.length > 0) map.set(key, hits);
    }
    return map;
  }, [gridDays, scheduledTasks]);

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="calendar"
    >
      <PageTitle
        title={t("tasks:calendar.pageTitle", { name: board?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/80 px-3 py-2 sm:px-4">
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
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => {
                  if (calView === "day") setCursor((c) => addDays(c, -1));
                  else if (calView === "week")
                    setCursor((c) => addWeeks(c, -1));
                  else setCursor((c) => subMonths(c, 1));
                }}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setCursor(new Date())}
              >
                {t("tasks:calendar.today")}
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => {
                  if (calView === "week") setCursor((c) => addWeeks(c, 1));
                  else if (calView === "year") setCursor((c) => addYears(c, 1));
                  else setCursor((c) => addMonths(c, 1));
                }}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
            <h1 className="text-xs font-semibold text-foreground">
              {calView === "week"
                ? `${format(dateFnsStartOfWeek(cursor, { weekStartsOn }), "MMM d")} - ${format(dateFnsEndOfWeek(cursor, { weekStartsOn }), "MMM d yyyy")}`
                : calView === "year"
                  ? format(cursor, "yyyy")
                  : format(cursor, "MMMM yyyy")}
            </h1>
            <div className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5">
              {(["week", "month", "year"] as const).map((v) => (
                <Button
                  key={v}
                  variant={calView === v ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setCalView(v)}
                  className={cn(
                    "h-5 rounded-md px-2 text-xs capitalize",
                    calView !== v && "text-muted-foreground",
                  )}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TaskViewControls
              sort={sort}
              onSortChange={setSort}
              group={group}
              onGroupChange={setGroup}
              display={display}
              onDisplayChange={setDisplay}
            />
            <CreateTaskAction boardId={boardId} />
          </div>
        </div>

        <div
          className="grid shrink-0 border-b border-border/80"
          style={{
            gridTemplateColumns: `repeat(${Math.min(gridDays.length, 7)}, minmax(0, 1fr))`,
          }}
        >
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="grid min-h-0 flex-1 auto-rows-fr overflow-auto"
          style={{
            gridTemplateColumns: `repeat(${Math.min(gridDays.length, 7)}, minmax(0, 1fr))`,
          }}
        >
          {gridDays.map((day) => {
            const dayTasks = tasksByDay.get(day.toDateString()) ?? [];
            const outsideMonth =
              calView === "month" && !isSameMonth(day, cursor);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex min-h-24 flex-col gap-1 border-r border-b border-border/60 px-[7px] py-1.5",
                  isWeekend(day) && "bg-muted/20",
                  outsideMonth && "bg-muted/40 text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[11px] font-medium",
                      isToday(day) && "bg-primary text-primary-foreground",
                      outsideMonth && !isToday(day) && "text-muted-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 2 ? (
                    <span className="text-[10px] text-muted-foreground">
                      {dayTasks.length}
                    </span>
                  ) : null}
                </div>

                {dayTasks.slice(0, 3).map((task) => {
                  const colors = statusBarClasses(task.status);
                  const isStart = isSameDay(day, task.scheduleStart);
                  const isEnd = isSameDay(day, task.scheduleEnd);

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openTask(task.id)}
                      title={task.title}
                      className={cn(
                        // No w-full: width must come from the flex stretch so the
                        // negative margins below actually widen the band.
                        "flex h-[18px] items-center gap-1 border-y px-1 text-left text-[11px] leading-tight text-foreground transition-colors",
                        colors.fill,
                        colors.border,
                        // Bleed over the cell's padding (7px) and the right cell
                        // border (1px) so a multi-day task reads as one band.
                        isStart
                          ? "rounded-l-sm border-l"
                          : "-ml-[7px] border-l-0 pl-0",
                        isEnd
                          ? "rounded-r-sm border-r"
                          : "-mr-[8px] border-r-0",
                      )}
                    >
                      <span className="truncate">
                        {isStart || day.getDay() === weekStartsOn
                          ? `${display.priority && task.priority ? `[${task.priority}] ` : ""}${task.title}${display.assignee && task.assigneeName ? ` @${task.assigneeName}` : ""}`
                          : ""}
                      </span>
                    </button>
                  );
                })}

                {dayTasks.length > 3 ? (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    {t("tasks:calendar.more", { count: dayTasks.length - 3 })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

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
