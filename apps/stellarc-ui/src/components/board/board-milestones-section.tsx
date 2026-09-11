import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Milestone as MilestoneRow } from "@/fetchers/milestone/get-milestones-by-board";
import useCreateMilestone from "@/hooks/mutations/milestone/use-create-milestone";
import useDeleteMilestone from "@/hooks/mutations/milestone/use-delete-milestone";
import useUpdateMilestone from "@/hooks/mutations/milestone/use-update-milestone";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import { cn } from "@/lib/cn";
import {
  getMilestoneProgress,
  type MilestoneTaskLike,
} from "@/lib/milestone-progress";
import { toast } from "@/lib/toast";

const MILESTONE_STATUSES = [
  "planned",
  "active",
  "completed",
  "archived",
] as const;

type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

type BoardMilestonesSectionProps = {
  boardId: string;
  /** Every task on the board — used to INFER each milestone's dates/progress. */
  tasks: MilestoneTaskLike[];
};

function formatRange(start: Date | null, end: Date | null, fallback: string) {
  if (!start && !end) return fallback;
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (start && end && start.getTime() !== end.getTime()) {
    return `${fmt(start)} – ${fmt(end)}`;
  }
  const single = start ?? end;
  return single ? fmt(single) : fallback;
}

/**
 * Milestone management for the board properties panel: list, create, rename,
 * change status, delete. Dates and percent-complete are never entered by hand —
 * they are derived from the tasks pointing at each milestone.
 */
export default function BoardMilestonesSection({
  boardId,
  tasks,
}: BoardMilestonesSectionProps) {
  const { t } = useTranslation();
  const { data: milestones = [], isLoading } = useGetMilestonesByBoard(boardId);
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDueDate, setEditingDueDate] = useState("");

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createMilestone.mutateAsync({
        boardId,
        name,
        description: null,
        dueDate: newDueDate || null,
        status: "planned",
      });
      setNewName("");
      setNewDueDate("");
      setIsCreating(false);
      toast.success(t("tasks:milestone.manage.created"));
    } catch {
      toast.error(t("tasks:milestone.manage.saveFailed"));
    }
  };

  const handleRename = async (milestone: MilestoneRow) => {
    const name = editingName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    try {
      await updateMilestone.mutateAsync({
        boardId,
        id: milestone.id,
        name,
        dueDate: editingDueDate || null,
      });
      setEditingId(null);
      toast.success(t("tasks:milestone.manage.updated"));
    } catch {
      toast.error(t("tasks:milestone.manage.saveFailed"));
    }
  };

  const handleStatusChange = async (
    milestone: MilestoneRow,
    status: MilestoneStatus,
  ) => {
    try {
      await updateMilestone.mutateAsync({ boardId, id: milestone.id, status });
      toast.success(t("tasks:milestone.manage.updated"));
    } catch {
      toast.error(t("tasks:milestone.manage.saveFailed"));
    }
  };

  const handleDelete = async (milestone: MilestoneRow) => {
    try {
      await deleteMilestone.mutateAsync({ boardId, id: milestone.id });
      toast.success(t("tasks:milestone.manage.deleted"));
    } catch {
      toast.error(t("tasks:milestone.manage.deleteFailed"));
    }
  };

  return (
    <section className="flex flex-col gap-2" data-testid="board-milestones">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("tasks:milestone.manage.title")}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="board-milestone-add"
          onClick={() => setIsCreating((open) => !open)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isCreating ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={newName}
            data-testid="board-milestone-name-input"
            placeholder={t("tasks:milestone.manage.namePlaceholder")}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
              if (event.key === "Escape") setIsCreating(false);
            }}
          />
          <Input
            type="date"
            value={newDueDate}
            aria-label={t("tasks:milestone.manage.dueDate")}
            data-testid="board-milestone-due-date-input"
            onChange={(event) => setNewDueDate(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            data-testid="board-milestone-create-submit"
            disabled={!newName.trim() || createMilestone.isPending}
            onClick={() => void handleCreate()}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-muted-foreground text-xs">
          {t("tasks:milestone.loading")}
        </p>
      ) : null}

      {!isLoading && milestones.length === 0 ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="board-milestones-empty"
        >
          {t("tasks:milestone.empty")}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {milestones.map((milestone: MilestoneRow) => {
          const progress = getMilestoneProgress(tasks, milestone.id);
          return (
            <li
              key={milestone.id}
              data-testid={`board-milestone-${milestone.id}`}
              className="rounded-md border border-border p-2"
            >
              <div className="flex items-center justify-between gap-1.5">
                {editingId === milestone.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    data-testid={`board-milestone-rename-${milestone.id}`}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleRename(milestone);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <span className="truncate font-medium text-sm">
                    {milestone.name}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  {editingId === milestone.id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`board-milestone-edit-${milestone.id}`}
                      onClick={() => {
                        setEditingId(milestone.id);
                        setEditingName(milestone.name);
                        setEditingDueDate(
                          milestone.dueDate
                            ? String(milestone.dueDate).slice(0, 10)
                            : "",
                        );
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid={`board-milestone-delete-${milestone.id}`}
                    onClick={() => void handleDelete(milestone)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {editingId === milestone.id ? (
                <Input
                  className="mt-1.5"
                  type="date"
                  value={editingDueDate}
                  aria-label={t("tasks:milestone.manage.dueDate")}
                  data-testid={`board-milestone-due-date-${milestone.id}`}
                  onChange={(event) => setEditingDueDate(event.target.value)}
                />
              ) : milestone.dueDate ? (
                <p
                  className="mt-1.5 text-[11px] text-muted-foreground"
                  data-testid={`board-milestone-due-${milestone.id}`}
                >
                  {t("tasks:milestone.manage.dueDate")}:{" "}
                  {String(milestone.dueDate).slice(0, 10)}
                </p>
              ) : null}

              <div className="mt-1.5 flex items-center gap-1">
                {MILESTONE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    data-testid={`board-milestone-status-${milestone.id}-${status}`}
                    onClick={() => void handleStatusChange(milestone, status)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] capitalize",
                      milestone.status === status
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`tasks:milestone.status.${status}`)}
                  </button>
                ))}
              </div>

              {/* Task-derived range and progress coexist with the explicit due date. */}
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span data-testid={`board-milestone-range-${milestone.id}`}>
                  {formatRange(
                    progress.startDate,
                    progress.endDate,
                    t("tasks:milestone.manage.noDates"),
                  )}
                </span>
                <span data-testid={`board-milestone-progress-${milestone.id}`}>
                  {progress.percentComplete}% · {progress.completedCount}/
                  {progress.taskCount}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
