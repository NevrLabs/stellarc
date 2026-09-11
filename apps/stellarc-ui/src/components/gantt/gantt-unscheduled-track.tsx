import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

/**
 * #244: drag-to-schedule for tasks that have no dates yet.
 *
 * The timeline could only move bars that already existed, so on a board where
 * nearly every ticket is unscheduled (the real case: 200 unscheduled vs 1
 * scheduled) there was effectively nothing to drag — "timeline drag and drop"
 * appeared not to work at all. An unscheduled row rendered a static hint chip
 * whose only action was opening the task.
 *
 * Dragging across this row's empty track now paints a date range and commits it,
 * turning the row into a real bar. The click-to-open behaviour is preserved for
 * gestures below the movement threshold.
 */

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;

type GanttUnscheduledTrackProps = {
  task: Task;
  timeline: {
    days: Date[];
    rangeStart: Date;
    gridTemplateColumns: string;
  };
  pixelsPerDay: number;
  isMobile?: boolean;
  /** Foreign tasks are context only and must stay non-editable. */
  readOnly?: boolean;
  hint: string;
  onOpenTask: () => void;
};

function toIsoDay(date: Date) {
  return startOfDay(date).toISOString();
}

/** Clamp a day index into the rendered track. */
function clampIndex(index: number, trackCount: number) {
  return Math.max(0, Math.min(index, trackCount - 1));
}

export function GanttUnscheduledTrack({
  task,
  timeline,
  pixelsPerDay,
  isMobile = false,
  readOnly = false,
  hint,
  onOpenTask,
}: GanttUnscheduledTrackProps) {
  const { t } = useTranslation();
  const { mutateAsync: updateTask } = useUpdateTask();
  const [draft, setDraft] = useState<{ start: Date; end: Date } | null>(null);

  const trackCount = timeline.days.length;
  const pxPerDay = Math.max(pixelsPerDay, 1e-6);
  const moveThresholdPx = isMobile
    ? MOBILE_MOVE_THRESHOLD_PX
    : CLICK_MOVE_THRESHOLD_PX;

  const persistDates = useCallback(
    async (nextStart: Date, nextEnd: Date) => {
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

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (event.button !== 0) return;

    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const originX = event.clientX;
    // Which day column the gesture started on, relative to the track itself —
    // this row has no existing bar to anchor against.
    const anchorIndex = clampIndex(
      Math.floor((originX - rect.left) / pxPerDay),
      trackCount,
    );

    const rangeFor = (clientX: number) => {
      const currentIndex = clampIndex(
        Math.floor((clientX - rect.left) / pxPerDay),
        trackCount,
      );
      const lowIndex = Math.min(anchorIndex, currentIndex);
      const highIndex = Math.max(anchorIndex, currentIndex);
      const start = timeline.days[lowIndex];
      const end = timeline.days[highIndex];
      if (!start || !end) return null;
      return { start, end };
    };

    const initial = rangeFor(originX);
    if (initial) setDraft(initial);

    const onMove = (ev: PointerEvent) => {
      const next = rangeFor(ev.clientX);
      if (next) setDraft(next);
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);

      if (ev.type === "pointercancel") {
        setDraft(null);
        return;
      }

      const moved = Math.abs(ev.clientX - originX);
      if (moved < moveThresholdPx) {
        // A tap, not a drag — keep the previous behaviour of opening the task
        // so scheduling via the date pickers is still reachable.
        setDraft(null);
        onOpenTask();
        return;
      }

      const next = rangeFor(ev.clientX);
      if (!next) {
        setDraft(null);
        return;
      }

      const ok = await persistDates(next.start, next.end);
      if (!ok) setDraft(null);
      // On success the task gains dates, so the parent re-renders it as a real
      // GanttTaskBar and this component unmounts.
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  if (readOnly) {
    return (
      <button
        type="button"
        onClick={onOpenTask}
        className="sticky left-0 z-[1] my-1 ml-2 flex h-[calc(100%-0.5rem)] items-center rounded border border-dashed border-border bg-card px-2 text-[10px] text-muted-foreground"
      >
        {hint}
      </button>
    );
  }

  const draftStartIndex = draft
    ? clampIndex(
        differenceInCalendarDays(draft.start, timeline.rangeStart),
        trackCount,
      )
    : 0;
  const draftEndIndex = draft
    ? clampIndex(
        differenceInCalendarDays(draft.end, timeline.rangeStart),
        trackCount,
      )
    : 0;
  const draftDays = draft ? draftEndIndex - draftStartIndex + 1 : 0;

  return (
    <div
      data-testid="gantt-unscheduled-track"
      onPointerDown={handlePointerDown}
      title={t("tasks:gantt.dragToScheduleHint", {
        defaultValue: "Drag across the timeline to schedule this ticket",
      })}
      className="absolute inset-0 z-[1] cursor-cell touch-none"
    >
      {draft ? (
        <div
          className="pointer-events-none absolute inset-y-0 grid"
          style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
        >
          <div
            style={{
              gridColumn: `${draftStartIndex + 1} / ${draftEndIndex + 2}`,
            }}
            className={cn(
              "relative mx-1 my-1 flex items-center justify-center rounded border border-dashed border-primary/70 bg-primary/25",
            )}
          >
            <div className="pointer-events-none absolute -top-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-popover-foreground shadow-md">
              {format(draft.start, "MMM d")}
              {draftDays > 1 ? ` → ${format(draft.end, "MMM d")}` : ""}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          // The gesture is handled by the wrapper; this stays a real button so
          // the row remains keyboard reachable and screen-reader announced.
          onClick={onOpenTask}
          className="sticky left-0 z-[1] my-1 ml-2 flex h-[calc(100%-0.5rem)] items-center rounded border border-dashed border-border bg-card px-2 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted"
          style={{ width: "max-content" }}
        >
          {hint}
        </button>
      )}
    </div>
  );
}
