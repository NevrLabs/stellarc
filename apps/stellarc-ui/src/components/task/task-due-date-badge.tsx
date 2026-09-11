import { format } from "date-fns";
import {
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import {
  dueDateStatusColors,
  getDueDateOutcome,
  getDueDateStatus,
} from "@/lib/due-date-status";

/**
 * The due-date chip shown on task cards and rows.
 *
 * #178: a task in Done still rendered the destructive red "overdue" treatment,
 * shouting about a deadline that no longer matters. Completed tasks now get the
 * quietest styling available plus a small Early / On time / Late remark, so the
 * outcome is recorded without competing for attention.
 *
 * Extracted to one component because six surfaces (kanban card, list row,
 * backlog row, public card, public row, detail sheet) each had their own copy of
 * this markup.
 */
export default function TaskDueDateBadge({
  dueDate,
  status,
  completedAt,
  className,
}: {
  dueDate: string;
  status?: string | null;
  /** Best available completion time; see the note on `getDueDateOutcome`. */
  completedAt?: string | Date | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const state = getDueDateStatus(dueDate, status);
  const outcome =
    state === "completed" ? getDueDateOutcome(dueDate, completedAt) : null;

  const Icon =
    state === "completed"
      ? CalendarCheck
      : state === "overdue"
        ? CalendarX
        : state === "due-soon"
          ? CalendarClock
          : Calendar;

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-[10px]",
        dueDateStatusColors[state],
        className,
      )}
      data-due-outcome={outcome ?? undefined}
      data-due-state={state}
      data-testid="task-due-date"
    >
      <Icon className="h-3 w-3" />
      <span>{format(new Date(dueDate), "MMM d")}</span>
      {outcome && (
        <span className="opacity-80">
          {"\u00b7"} {t(`tasks:dueDate.outcome.${outcome}`)}
        </span>
      )}
    </div>
  );
}
