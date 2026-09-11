import { Check, Milestone, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Milestone as MilestoneRow } from "@/fetchers/milestone/get-milestones-by-board";
import useAssignMilestoneToTask from "@/hooks/mutations/milestone/use-assign-milestone-to-task";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type TaskMilestonePickerProps = {
  taskId: string;
  boardId: string;
  milestoneId: string | null | undefined;
  disabled?: boolean;
  className?: string;
};

/**
 * Board-scoped milestone picker for the task detail sidebar. Selecting the
 * already-assigned milestone (or the explicit clear row) unassigns it by
 * sending milestoneId: null.
 */
export default function TaskMilestonePicker({
  taskId,
  boardId,
  milestoneId,
  disabled = false,
  className,
}: TaskMilestonePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: milestones = [], isLoading } = useGetMilestonesByBoard(boardId);
  const { mutateAsync: assignMilestone, isPending } =
    useAssignMilestoneToTask();

  const selected = useMemo(
    () =>
      milestones.find(
        (milestone: MilestoneRow) => milestone.id === milestoneId,
      ),
    [milestones, milestoneId],
  );

  const assignableMilestones = useMemo(() => {
    const term = search.trim().toLowerCase();
    return milestones.filter((milestone: MilestoneRow) => {
      if (milestone.status === "archived" && milestone.id !== milestoneId) {
        return false;
      }
      return term ? milestone.name.toLowerCase().includes(term) : true;
    });
  }, [milestones, milestoneId, search]);

  const handleSelect = async (nextMilestoneId: string | null) => {
    try {
      await assignMilestone({ boardId, taskId, milestoneId: nextMilestoneId });
      toast.success(
        nextMilestoneId
          ? t("tasks:milestone.assigned")
          : t("tasks:milestone.cleared"),
      );
    } catch {
      toast.error(t("tasks:milestone.assignFailed"));
    } finally {
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          data-testid="task-milestone-trigger"
          variant="ghost"
          size="sm"
          disabled={disabled || isPending}
          aria-label={t("tasks:milestone.title")}
          className={cn("justify-start h-7 px-1.5 gap-1.5", className)}
        >
          <Milestone className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold truncate">
            {selected ? selected.name : t("tasks:milestone.none")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("tasks:milestone.searchPlaceholder")}
            aria-label={t("tasks:milestone.searchPlaceholder")}
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            type="button"
            data-testid="task-milestone-clear"
            onClick={() => void handleSelect(null)}
            disabled={isPending}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <X className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("tasks:milestone.clear")}</span>
          </button>
          {isLoading && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("tasks:milestone.loading")}
            </p>
          )}
          {!isLoading && assignableMilestones.length === 0 && (
            <p
              data-testid="task-milestone-empty"
              className="px-2 py-1.5 text-xs text-muted-foreground"
            >
              {t("tasks:milestone.empty")}
            </p>
          )}
          {assignableMilestones.map((milestone: MilestoneRow) => {
            const isSelected = milestone.id === milestoneId;
            return (
              <button
                key={milestone.id}
                type="button"
                data-testid={`task-milestone-option-${milestone.id}`}
                onClick={() =>
                  void handleSelect(isSelected ? null : milestone.id)
                }
                disabled={isPending}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    isSelected ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{milestone.name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
