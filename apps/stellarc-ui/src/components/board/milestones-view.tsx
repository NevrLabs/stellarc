import { useNavigate } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Milestone } from "@/fetchers/milestone/get-milestones-by-board";
import { cn } from "@/lib/cn";
import {
  getMilestoneProgress,
  getMilestoneTasks,
  type MilestoneTaskLike,
} from "@/lib/milestone-progress";

type MilestoneViewTask = MilestoneTaskLike & {
  title: string;
  number: number | null;
};

type MilestonesViewProps = {
  milestones: Milestone[];
  tasks: MilestoneViewTask[];
  organizationId: string;
  boardId: string;
};

function formatDueDate(
  value: string | Date | null | undefined,
  fallback: string,
) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : parseISO(value);
  return Number.isNaN(date.getTime()) ? fallback : format(date, "MMM d, yyyy");
}

export default function MilestonesView({
  milestones,
  tasks,
  organizationId,
  boardId,
}: MilestonesViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (milestones.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {t("tasks:milestone.view.empty")}
      </div>
    );
  }

  const openTask = (taskId: string) =>
    navigate({
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug/milestones",
      params: { organizationSlug: organizationId, boardSlug: boardId },
      search: { taskId },
    });

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
      <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">
          {t("tasks:milestone.view.caption")}
        </caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="border-b px-3 py-2 font-medium">
              {t("tasks:milestone.view.milestone")}
            </th>
            <th scope="col" className="border-b px-3 py-2 font-medium">
              {t("tasks:milestone.view.dueDate")}
            </th>
            <th scope="col" className="border-b px-3 py-2 font-medium">
              {t("tasks:milestone.view.progress")}
            </th>
            <th scope="col" className="border-b px-3 py-2 font-medium">
              {t("tasks:milestone.view.status")}
            </th>
            <th scope="col" className="border-b px-3 py-2 font-medium">
              {t("tasks:milestone.view.tasks")}
            </th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((milestone) => {
            const relatedTasks = getMilestoneTasks(tasks, milestone.id);
            const progress = getMilestoneProgress(tasks, milestone.id);
            return (
              <tr key={milestone.id} className="align-top">
                <th scope="row" className="border-b px-3 py-4 font-medium">
                  {milestone.name}
                </th>
                <td className="border-b px-3 py-4 text-muted-foreground">
                  {formatDueDate(
                    milestone.dueDate,
                    t("tasks:milestone.view.noDueDate"),
                  )}
                </td>
                <td className="border-b px-3 py-4">
                  <div className="flex min-w-36 items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${progress.percentComplete}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-xs">
                      {progress.percentComplete}% ({progress.completedCount}/
                      {progress.taskCount})
                    </span>
                  </div>
                </td>
                <td className="border-b px-3 py-4">
                  <span
                    className={cn(
                      "inline-flex rounded-full bg-muted px-2 py-0.5 text-xs capitalize",
                      milestone.status === "completed" &&
                        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    )}
                  >
                    {t(`tasks:milestone.status.${milestone.status}`)}
                  </span>
                </td>
                <td className="border-b px-3 py-3">
                  {relatedTasks.length ? (
                    <ul className="space-y-1">
                      {relatedTasks.map((task) => (
                        <li key={task.id}>
                          <button
                            type="button"
                            className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => openTask(task.id)}
                          >
                            {task.number != null ? (
                              <span className="text-xs text-muted-foreground">
                                #{task.number}
                              </span>
                            ) : null}
                            <span className="min-w-0 flex-1 truncate">
                              {task.title}
                            </span>
                            <ChevronRight
                              className="size-3.5 text-muted-foreground/70 transition-colors group-hover:text-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("tasks:milestone.view.noTasks")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
