import { Check } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutNumber } from "@/components/ui/shortcut-number";
import { useUpdateTaskPriority } from "@/hooks/mutations/task/use-update-task-status-priority";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type SubtaskPriorityPopoverProps = {
  tasks: Task[];
  children: React.ReactNode;
};

const priorityOptions = [
  { value: "no-priority" },
  { value: "low" },
  { value: "medium" },
  { value: "high" },
  { value: "urgent" },
];

/**
 * Priority picker for subtask rows. Mirrors SubtaskStatusPopover: it accepts the
 * current selection so a multi-select edit applies to every chosen subtask, and
 * only shows a tick when they already agree.
 */
export default function SubtaskPriorityPopover({
  tasks,
  children,
}: SubtaskPriorityPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskPriority } = useUpdateTaskPriority();
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();

  const allSamePriority =
    tasks.length > 0 &&
    tasks.every(
      (task) => (task.priority ?? null) === (tasks[0].priority ?? null),
    );
  const currentPriority = allSamePriority
    ? (tasks[0].priority ?? "no-priority")
    : null;

  const handlePriorityChange = useCallback(
    async (newPriority: string) => {
      try {
        await Promise.all(
          tasks.map((task) =>
            updateTaskPriority({
              ...task,
              priority: newPriority,
            }),
          ),
        );
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.priority.updateError"),
        );
      }
    },
    [t, tasks, updateTaskPriority],
  );

  const shortcutOptions = useMemo(
    () =>
      priorityOptions.map((priority) => ({
        onSelect: () => handlePriorityChange(priority.value),
      })),
    [handlePriorityChange],
  );

  useNumberedShortcuts(open, shortcutOptions);

  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div>
          {priorityOptions.map((priority, index) => (
            <Button
              key={priority.value}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 px-2 rounded-none first:rounded-t-md last:rounded-b-md"
              onClick={() => handlePriorityChange(priority.value)}
            >
              {getPriorityIcon(priority.value)}
              <span className="text-sm">
                {getPriorityLabel(priority.value)}
              </span>
              {currentPriority === priority.value ? (
                <Check className="ml-auto h-4 w-4" />
              ) : (
                <ShortcutNumber number={index + 1} />
              )}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
