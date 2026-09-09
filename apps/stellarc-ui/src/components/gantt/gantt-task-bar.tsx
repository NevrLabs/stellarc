import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfDay,
} from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { statusBarClasses } from "./gantt-timeline";

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;

/**
 * Resize handles are sized as a share of ONE DAY column, so they stay slim and
 * consistent whether the bar spans one day or three weeks.
 *
 * History: they were a fixed 24px each. Two of those need 48px, but a
 * single-day bar is only ~36px wide, so the handles ate the whole bar and
 * drag-to-move was impossible. Hiding them on short bars fixed dragging but
 * left a single-day bar with no way to resize at all. A slim handle only needs
 * to read as an edge, so both fit even on the narrowest bar.
 */
const RESIZE_HANDLE_DAY_FRACTION = 0.15;
/** Thin enough to look like an edge, wide enough to hit. */
const RESIZE_HANDLE_MIN_PX = 4;
/** Never let a handle dominate a narrow bar. */
const RESIZE_HANDLE_MAX_PX = 10;
/** Dragging must always be possible, so the move zone gets first claim. */
const MIN_MOVE_ZONE_PX = 12;

/**
 * @param pixelsPerDay width of one day column
 * @param barWidthPx   width of this bar, used only to guarantee the move zone
 *                     survives. At week/month zoom a day column is 16px/6px, so
 *                     a single-day bar cannot afford two handles at all.
 */
export function resolveResizeHandleWidth(
  pixelsPerDay: number,
  barWidthPx?: number,
): number {
  if (!Number.isFinite(pixelsPerDay) || pixelsPerDay <= 0) {
    return RESIZE_HANDLE_MIN_PX;
  }
  const proportional = Math.round(pixelsPerDay * RESIZE_HANDLE_DAY_FRACTION);
  const preferred = Math.max(
    RESIZE_HANDLE_MIN_PX,
    Math.min(RESIZE_HANDLE_MAX_PX, proportional),
  );
  if (!Number.isFinite(barWidthPx) || barWidthPx === undefined) {
    return preferred;
  }
  // Two handles plus a draggable middle must fit, otherwise drop the handles.
  const affordable = Math.floor((barWidthPx - MIN_MOVE_ZONE_PX) / 2);
  if (affordable < RESIZE_HANDLE_MIN_PX) return 0;
  return Math.min(preferred, affordable);
}

type ScheduledTask = Task & {
  scheduleStart: Date;
  scheduleEnd: Date;
};

type GanttTaskBarProps = {
  task: ScheduledTask;
  /** Tasks from another board are shown for context only — not editable here. */
  readOnly?: boolean;
  timeline: {
    days: Date[];
    rangeStart: Date;
    gridTemplateColumns: string;
  };
  pixelsPerDay: number;
  isMobile?: boolean;
  onOpenTask: () => void;
};

function getBarGridColumns(
  scheduleStart: Date,
  scheduleEnd: Date,
  rangeStart: Date,
  trackCount: number,
): { barInView: boolean; lineStart: number; lineEnd: number } {
  const startIndex = differenceInCalendarDays(scheduleStart, rangeStart);
  const endIndex = differenceInCalendarDays(scheduleEnd, rangeStart);
  const barInView = endIndex >= 0 && startIndex < trackCount && trackCount > 0;
  if (!barInView) {
    return { barInView: false, lineStart: 1, lineEnd: 1 };
  }
  const lineStart = Math.max(1, Math.min(startIndex + 1, trackCount));
  const lineEnd = Math.max(
    lineStart + 1,
    Math.min(endIndex + 2, trackCount + 1),
  );
  return { barInView: true, lineStart, lineEnd };
}

function toIsoDay(d: Date) {
  return startOfDay(d).toISOString();
}

export function GanttTaskBar({
  task,
  timeline,
  pixelsPerDay,
  isMobile = false,
  readOnly = false,
  onOpenTask,
}: GanttTaskBarProps) {
  const { t } = useTranslation();
  const { mutateAsync: updateTask } = useUpdateTask();
  const [dragDisplay, setDragDisplay] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  // Drop the drag overlay once server data matches
  useEffect(() => {
    if (!dragDisplay) return;
    const startMatches =
      differenceInCalendarDays(task.scheduleStart, dragDisplay.start) === 0;
    const endMatches =
      differenceInCalendarDays(task.scheduleEnd, dragDisplay.end) === 0;
    if (startMatches && endMatches) {
      setDragDisplay(null);
    }
  }, [dragDisplay, task.scheduleEnd, task.scheduleStart]);

  const displayStart = dragDisplay?.start ?? task.scheduleStart;
  const displayEnd = dragDisplay?.end ?? task.scheduleEnd;

  const trackCount = timeline.days.length;
  const { barInView, lineStart, lineEnd } = getBarGridColumns(
    displayStart,
    displayEnd,
    timeline.rangeStart,
    trackCount,
  );

  const persistDates = useCallback(
    async (nextStart: Date, nextEnd: Date): Promise<boolean> => {
      try {
        await updateTask({
          ...task,
          startDate: toIsoDay(nextStart),
          dueDate: toIsoDay(nextEnd),
        });
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:gantt.updateDatesError"),
        );
        return false;
      }
    },
    [task, updateTask, t],
  );

  const pxPerDay = Math.max(pixelsPerDay, 1e-6);
  const moveThresholdPx = isMobile
    ? MOBILE_MOVE_THRESHOLD_PX
    : CLICK_MOVE_THRESHOLD_PX;

  const handleResizeLeftPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const endIdx = differenceInCalendarDays(initialEnd, timeline.rangeStart);

    const onMove = (ev: PointerEvent) => {
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextStartIdx = startIdx + deltaDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, endIdx));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = initialEnd;
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ev.type === "pointercancel") {
        setDragDisplay(null);
        return;
      }
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextStartIdx = startIdx + deltaDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, endIdx));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      if (nextStart.getTime() === initialStart.getTime()) {
        setDragDisplay(null);
        return;
      }
      const ok = await persistDates(nextStart, initialEnd);
      if (!ok) {
        setDragDisplay(null);
      }
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const handleResizeRightPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const endIdx = differenceInCalendarDays(initialEnd, timeline.rangeStart);

    const onMove = (ev: PointerEvent) => {
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextEndIdx = endIdx + deltaDays;
      nextEndIdx = Math.max(startIdx, Math.min(nextEndIdx, trackCount - 1));
      const nextEnd = timeline.days[nextEndIdx] ?? initialEnd;
      const nextStart = initialStart;
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ev.type === "pointercancel") {
        setDragDisplay(null);
        return;
      }
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextEndIdx = endIdx + deltaDays;
      nextEndIdx = Math.max(startIdx, Math.min(nextEndIdx, trackCount - 1));
      const nextEnd = timeline.days[nextEndIdx] ?? initialEnd;
      if (nextEnd.getTime() === initialEnd.getTime()) {
        setDragDisplay(null);
        return;
      }
      const ok = await persistDates(initialStart, nextEnd);
      if (!ok) {
        setDragDisplay(null);
      }
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const handleMovePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const originX = event.clientX;
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const durationDays = differenceInCalendarDays(initialEnd, initialStart);
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );

    const onMove = (ev: PointerEvent) => {
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextStartIdx = startIdx + deltaDays;
      const maxStart = trackCount - 1 - durationDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, maxStart));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = addDays(nextStart, durationDays);
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ev.type === "pointercancel") {
        setDragDisplay(null);
        return;
      }
      const moved = Math.abs(ev.clientX - originX);
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextStartIdx = startIdx + deltaDays;
      const maxStart = trackCount - 1 - durationDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, maxStart));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = addDays(nextStart, durationDays);

      if (moved < moveThresholdPx) {
        setDragDisplay(null);
        onOpenTask();
        return;
      }
      if (
        nextStart.getTime() === initialStart.getTime() &&
        nextEnd.getTime() === initialEnd.getTime()
      ) {
        setDragDisplay(null);
        return;
      }
      const ok = await persistDates(nextStart, nextEnd);
      if (!ok) {
        setDragDisplay(null);
      }
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  if (!barInView || lineEnd <= lineStart) {
    return null;
  }

  const colors = statusBarClasses(task.status);

  // Handles are sized off a single day column so they stay slim on every bar,
  // but never at the cost of the draggable middle (week/month zoom is narrow).
  const barWidthPx = (lineEnd - lineStart) * pixelsPerDay - 8;
  const resizeHandlePx = resolveResizeHandleWidth(pixelsPerDay, barWidthPx);
  const showResizeHandles = resizeHandlePx > 0;

  // Foreign tasks render as a plain, non-interactive band with no drag handles.
  if (readOnly) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-[1] grid"
        style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
      >
        <div
          style={{ gridColumn: `${lineStart} / ${lineEnd}` }}
          className={cn(
            "pointer-events-auto relative mx-1 flex h-7 min-w-0 items-center overflow-hidden rounded border border-dashed bg-card px-1.5 text-left text-xs font-medium leading-none text-muted-foreground",
            colors.border,
          )}
        >
          <div className={cn("absolute inset-0 z-0 opacity-50", colors.fill)} />
          <button
            type="button"
            onClick={onOpenTask}
            className="relative z-10 min-w-0 flex-1 truncate text-left"
          >
            {task.title}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] grid"
      style={{
        gridTemplateColumns: timeline.gridTemplateColumns,
      }}
    >
      <div
        style={{ gridColumn: `${lineStart} / ${lineEnd}` }}
        className={cn(
          "group pointer-events-auto relative mx-1 flex h-7 min-w-0 items-stretch overflow-visible rounded border bg-background text-left text-xs font-medium leading-none text-foreground shadow-sm transition-colors",
          colors.border,
        )}
      >
        {/* Live date readout while dragging or resizing. dragDisplay is already
            the optimistic range, so this needs no extra state. */}
        {dragDisplay ? (
          <div className="pointer-events-none absolute -top-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-popover-foreground shadow-md">
            {format(displayStart, "MMM d")}
            {differenceInCalendarDays(displayEnd, displayStart) === 0
              ? ""
              : ` → ${format(displayEnd, "MMM d")}`}
          </div>
        ) : null}
        {showResizeHandles ? (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeStart")}
            onPointerDown={handleResizeLeftPointerDown}
            style={{ width: `${resizeHandlePx}px` }}
            className={cn(
              "relative z-20 shrink-0 cursor-ew-resize touch-none after:absolute after:inset-y-0 after:right-0 after:w-1.5 after:border-r after:border-black/5 dark:after:border-white/10",
              colors.handle,
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          />
        ) : null}
        <button
          type="button"
          aria-label={t("tasks:gantt.taskAriaLabel", { title: task.title })}
          className="relative z-10 min-w-0 flex-1 cursor-grab touch-manipulation overflow-hidden px-1.5 text-left active:cursor-grabbing"
          onPointerDown={handleMovePointerDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenTask();
            }
          }}
        >
          <div
            className={cn(
              "absolute inset-0 z-0 transition-colors",
              colors.fill,
            )}
          />
          <span className="relative z-10 block truncate">{task.title}</span>
        </button>
        {showResizeHandles ? (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeDue")}
            onPointerDown={handleResizeRightPointerDown}
            style={{ width: `${resizeHandlePx}px` }}
            className={cn(
              "relative z-20 shrink-0 cursor-ew-resize touch-none after:absolute after:inset-y-0 after:left-0 after:w-1.5 after:border-l after:border-black/5 dark:after:border-white/10",
              colors.handle,
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
