import { differenceInCalendarDays, format } from "date-fns";
import { ChevronDown, ChevronRight, Diamond } from "lucide-react";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { GanttMilestone } from "./gantt-milestones";
import type { GanttTimeline } from "./gantt-timeline";

/**
 * Colour by milestone status. `fill-current`/`text-*` drive the diamond, the
 * border/bg variants tint the header row.
 */
const statusClasses: Record<string, string> = {
  planned: "text-violet-500",
  active: "text-indigo-500",
  completed: "text-emerald-500",
  archived: "text-muted-foreground",
};

/**
 * A milestone as a SECTION HEADER in the board timeline.
 *
 * Two deliberate differences from a task row:
 * - the timeline cell carries exactly ONE diamond, on the milestone's due date.
 *   No span bar: a milestone is a point in time, and a bar competed visually
 *   with the task bars underneath it.
 * - the rail is a button that collapses/expands every task in the section.
 */
export function GanttMilestoneRow({
  milestone,
  timeline,
  showTaskRail,
  taskColumnWidthRem,
  isMobile,
  collapsed = false,
  taskCount,
  onToggleCollapse,
}: {
  milestone: GanttMilestone;
  timeline: GanttTimeline;
  showTaskRail: boolean;
  taskColumnWidthRem: number;
  isMobile: boolean;
  collapsed?: boolean;
  /** Members actually in this section, which can differ from the API count. */
  taskCount?: number;
  onToggleCollapse?: (milestoneId: string) => void;
}) {
  const target = milestone.targetDate
    ? differenceInCalendarDays(milestone.targetDate, timeline.rangeStart)
    : null;
  const statusClass =
    statusClasses[milestone.status.toLowerCase()] ?? statusClasses.planned;
  const count = taskCount ?? milestone.taskCount;
  const dueLabel = milestone.targetDate
    ? `${milestone.targetIsExplicit ? "due" : "inferred target"} ${format(milestone.targetDate, "MMM d, yyyy")}`
    : "no due date";
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      data-testid={`gantt-milestone-${milestone.id}`}
      data-collapsed={collapsed ? "true" : "false"}
      className="grid h-9 items-stretch border-y border-indigo-500/25 bg-indigo-500/[0.06]"
      style={{
        gridTemplateColumns: showTaskRail
          ? isMobile
            ? `${taskColumnWidthRem}rem max-content`
            : "20rem max-content"
          : "max-content",
      }}
    >
      {showTaskRail ? (
        <div className="sticky left-0 z-[13] flex min-w-0 items-center border-r border-indigo-500/25 bg-card">
          <button
            type="button"
            aria-expanded={!collapsed}
            data-testid={`gantt-milestone-toggle-${milestone.id}`}
            onClick={() => onToggleCollapse?.(milestone.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left hover:bg-accent/60"
            title={`${milestone.name} · ${dueLabel} · ${milestone.percentComplete}% (${milestone.completedCount}/${count})`}
          >
            <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
            <Diamond
              className={cn("size-3 shrink-0 fill-current", statusClass)}
            />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
              {milestone.name}
            </span>
            <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
              {milestone.percentComplete}% · {milestone.completedCount}/{count}
            </span>
          </button>
        </div>
      ) : null}
      <div
        className="relative grid shrink-0 items-center"
        style={{
          gridTemplateColumns: timeline.gridTemplateColumns,
          minWidth: `${timeline.timelineMinWidthRem}rem`,
        }}
      >
        {target !== null && target >= 0 && target < timeline.days.length ? (
          // Local provider: this repo scopes TooltipProvider per component
          // rather than mounting one at the app root.
          <TooltipProvider delay={100} closeDelay={0}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    data-testid={`gantt-milestone-target-${milestone.id}`}
                    style={{ gridColumn: `${target + 1}`, gridRow: 1 }}
                    className="flex cursor-default items-center justify-center self-center outline-none"
                    type="button"
                    aria-label={`${milestone.name}, ${dueLabel}`}
                    title={`${milestone.name}: ${dueLabel}`}
                  />
                }
              >
                <Diamond
                  className={cn(
                    "size-4 fill-current stroke-[1.5]",
                    statusClass,
                  )}
                />
              </TooltipTrigger>
              <TooltipPopup>
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="font-medium">{milestone.name}</span>
                  <span className="text-muted-foreground">{dueLabel}</span>
                  <span className="text-muted-foreground">
                    {milestone.percentComplete}% · {milestone.completedCount}/
                    {count} done
                  </span>
                </div>
              </TooltipPopup>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}
