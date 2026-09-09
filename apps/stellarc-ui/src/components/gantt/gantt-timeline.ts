import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameMonth,
  isSameWeek,
  startOfWeek,
  subDays,
} from "date-fns";

export type GanttZoom = "day" | "week" | "month";

/** Column width in rem per zoom level. Day stays finger-friendly on mobile. */
const COLUMN_WIDTH_REM: Record<GanttZoom, { mobile: number; desktop: number }> =
  {
    day: { mobile: 3.125, desktop: 2.75 },
    week: { mobile: 1.25, desktop: 1 },
    month: { mobile: 0.5, desktop: 0.375 },
  };

/**
 * Days of head/tail padding beyond the task extent, per zoom.
 *
 * A fixed 28-day tail is fine at day zoom but makes month zoom useless: the
 * whole point of zooming out is planning past the last scheduled task, and the
 * timeline used to just stop ~4 weeks after it. Wider zooms get a longer
 * horizon so there is somewhere to drag a bar to.
 */
const PADDING_DAYS: Record<GanttZoom, { head: number; tail: number }> = {
  day: { head: 7, tail: 28 },
  week: { head: 14, tail: 120 },
  month: { head: 31, tail: 366 },
};

export type GanttTimeline = {
  days: Date[];
  rangeStart: Date;
  gridTemplateColumns: string;
  timelineMinWidthRem: number;
  dayWidthRem: number;
  /** Header cells spanning 1+ day columns, depending on zoom. */
  headerCells: { key: string; label: string; sublabel: string; span: number }[];
};

/**
 * "W1".."W6" — which week of the month this column belongs to.
 *
 * A week column is keyed by its start day, which frequently falls in the
 * previous month (e.g. a week starting Sun Aug 30 mostly covers September).
 * Numbering off that start day would label most months "W2..W5" and never W1,
 * so the week is attributed to whichever month holds its midpoint, then counted
 * from that month's first day. Six is a real outcome for a long month whose
 * first day sits late in a week.
 */
function weekOfMonthLabel(
  weekStart: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): string {
  const midweek = addDays(weekStart, 3);
  const firstOfMonth = new Date(midweek.getFullYear(), midweek.getMonth(), 1);
  const weeksIn = differenceInCalendarWeeks(midweek, firstOfMonth, {
    weekStartsOn,
  });
  return `W${weeksIn + 1}`;
}

/**
 * One day is always one grid column — zoom only changes how wide a day is and
 * how days are grouped in the header. Bar math stays in day units at every zoom.
 */
export function buildTimeline({
  earliest,
  latest,
  zoom,
  isMobile,
  weekStartsOn,
}: {
  earliest: Date;
  latest: Date;
  zoom: GanttZoom;
  isMobile: boolean;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}): GanttTimeline {
  const dayWidthRem = COLUMN_WIDTH_REM[zoom][isMobile ? "mobile" : "desktop"];
  const padding = PADDING_DAYS[zoom];

  // Week-aligned bounds, padded so bars can be dragged past the current extremes.
  const rangeStart = subDays(
    startOfWeek(earliest, { weekStartsOn }),
    padding.head,
  );
  const rangeEnd = addDays(endOfWeek(latest, { weekStartsOn }), padding.tail);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const headerCells: GanttTimeline["headerCells"] = [];
  for (const [index, day] of days.entries()) {
    const previous = days[index - 1];
    if (zoom === "day") {
      headerCells.push({
        key: day.toISOString(),
        label:
          !previous || !isSameMonth(day, previous) ? format(day, "MMM") : "",
        sublabel: format(day, "d"),
        span: 1,
      });
      continue;
    }
    // Week and month zoom both group by week; they differ in the label. Month
    // zoom shows W1..W5 within the month (the month itself is already named by
    // the span row above), week zoom shows the day-of-month.
    const groupStarts =
      !previous || !isSameWeek(day, previous, { weekStartsOn });
    if (groupStarts) {
      headerCells.push({
        key: day.toISOString(),
        label:
          zoom === "week"
            ? format(day, "MMM")
            : weekOfMonthLabel(day, weekStartsOn),
        sublabel: zoom === "week" ? format(day, "d") : "",
        span: 1,
      });
    } else {
      const current = headerCells[headerCells.length - 1];
      if (current) current.span += 1;
    }
  }

  return {
    days,
    rangeStart,
    dayWidthRem,
    gridTemplateColumns: `repeat(${days.length}, minmax(${dayWidthRem}rem, ${dayWidthRem}rem))`,
    timelineMinWidthRem: days.length * dayWidthRem,
    headerCells,
  };
}

/**
 * Bar tint by status family, so a row reads at a glance without a legend.
 * Falls back to a neutral tint for custom board columns.
 */
export function statusBarClasses(status: string): {
  fill: string;
  border: string;
  handle: string;
} {
  const normalized = status.toLowerCase().replace(/[\s_]/g, "-");
  if (normalized === "done" || normalized === "completed") {
    return {
      fill: "bg-emerald-500/25 group-hover:bg-emerald-500/35",
      border: "border-emerald-500/45",
      handle: "after:bg-emerald-500/20 hover:after:bg-emerald-500/35",
    };
  }
  if (normalized === "in-progress" || normalized === "in-review") {
    return {
      fill: "bg-blue-500/25 group-hover:bg-blue-500/35",
      border: "border-blue-500/45",
      handle: "after:bg-blue-500/20 hover:after:bg-blue-500/35",
    };
  }
  if (normalized === "planned" || normalized === "backlog") {
    return {
      fill: "bg-violet-500/25 group-hover:bg-violet-500/35",
      border: "border-violet-500/45",
      handle: "after:bg-violet-500/20 hover:after:bg-violet-500/35",
    };
  }
  if (normalized === "archived") {
    return {
      fill: "bg-muted-foreground/15 group-hover:bg-muted-foreground/25",
      border: "border-muted-foreground/30",
      handle: "after:bg-muted-foreground/15 hover:after:bg-muted-foreground/25",
    };
  }
  return {
    fill: "bg-primary/20 group-hover:bg-primary/30",
    border: "border-primary/40",
    handle: "after:bg-primary/15 hover:after:bg-primary/30",
  };
}

/** Left offset in rem of a date within the timeline, for overlays. */
/**
 * Weekend shading as a single CSS gradient instead of one tinted element per
 * day. Weekends repeat every 7 days, so we find the first Saturday in range and
 * paint a 2-day band with a 7-day period from there.
 *
 * The tint is `--muted` boosted via color-mix: the raw token is only ~4% alpha,
 * which is invisible as a large flat band (the old per-day divs stacked it on
 * an already-opaque surface). Returns null when the range has no weekend.
 */
export function weekendTintGradient(timeline: GanttTimeline): string | null {
  const firstSaturday = timeline.days.findIndex((day) => day.getDay() === 6);
  if (firstSaturday === -1) return null;

  const w = timeline.dayWidthRem;
  const originRem = firstSaturday * w;
  const tint = "color-mix(in srgb, var(--foreground) 7%, transparent)";
  return `repeating-linear-gradient(to right, ${tint} ${originRem}rem, ${tint} ${originRem + 2 * w}rem, transparent ${originRem + 2 * w}rem, transparent ${originRem + 7 * w}rem)`;
}

/**
 * Column separator lines, as one gradient rather than a border per day.
 *
 * #163: the grid is painted at every zoom, not just day zoom. A line every day
 * would be a 6px-period stripe pattern once columns shrink to month zoom, so
 * narrow columns fall back to a line per week — the same cadence the header
 * groups by.
 */
export function gridLineGradient(timeline: GanttTimeline): string {
  const dayWidth = timeline.dayWidthRem;
  // Below ~1.5rem a per-day line reads as hatching rather than a grid.
  const period = dayWidth >= 1.5 ? dayWidth : dayWidth * 7;
  const line = "color-mix(in srgb, var(--foreground) 12%, transparent)";
  return `repeating-linear-gradient(to right, transparent 0, transparent calc(${period}rem - 1px), ${line} calc(${period}rem - 1px), ${line} ${period}rem)`;
}
/** Left offset in rem of a date within the timeline, for overlays. */
export function dayOffsetRem(date: Date, timeline: GanttTimeline) {
  return (
    differenceInCalendarDays(date, timeline.rangeStart) * timeline.dayWidthRem
  );
}
