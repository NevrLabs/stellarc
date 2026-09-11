import { Archive, Check, Circle, CircleDashed } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutNumber } from "@/components/ui/shortcut-number";
import { useSetTaskArchived } from "@/hooks/mutations/task/use-set-task-archived";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getColumnIcon } from "@/lib/column";
import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskStatusPopoverProps = {
  task?: Task;
  boardId?: string;
  value?: string;
  onChange?: (status: string) => void;
  children?: React.ReactNode;
};

export default function TaskStatusPopover({
  task,
  boardId,
  value,
  onChange,
  children,
}: TaskStatusPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const {
    data: columns,
    isLoading,
    isError,
  } = useGetColumns(task?.boardId ?? boardId ?? "");
  const statusOptions = useMemo(
    () =>
      (columns ?? []).map((col) => ({
        value: col.slug,
        label: col.name,
        icon: col.icon,
        isFinal: col.isFinal,
      })),
    [columns],
  );
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();
  const { mutateAsync: setArchived } = useSetTaskArchived();
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();
  const currentStatus = task?.status ?? value;
  const selectedOption = statusOptions.find(
    (status) => status.value === currentStatus,
  );

  /**
   * `planned` IS a real status (the one the Backlog view reads), it just has no
   * board column, so it is offered below a divider instead of in the column
   * list.
   *
   * #226: Archive is deliberately NOT here. Archival is orthogonal to status —
   * it writes `task.archived_at` and leaves the workflow status intact — so it
   * gets its own action that calls the archive mutation. Sending
   * `status: "archived"` fails validation ("archived" is not a status) and would
   * destroy the ticket's real state.
   */
  const virtualActions = [
    {
      value: "planned",
      label: t("tasks:actions.moveToBacklog"),
      icon: <CircleDashed className="size-4 text-muted-foreground" />,
    },
  ];

  const isArchived = Boolean(task?.archivedAt);

  const handleArchiveToggle = useCallback(async () => {
    if (!task) return;
    try {
      await setArchived({
        taskId: task.id,
        archived: !isArchived,
        boardId: task.boardId,
      });
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:archive.error"),
      );
    }
  }, [isArchived, setArchived, t, task]);

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (onChange) {
        onChange(newStatus);
        setOpen(false);
        return;
      }
      if (!task) return;
      try {
        await updateTaskStatus({
          ...task,
          status: newStatus,
        });
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.status.updateError"),
        );
      }
    },
    [onChange, t, task, updateTaskStatus],
  );

  const shortcutOptions = useMemo(
    () =>
      statusOptions.map((status) => ({
        onSelect: () => handleStatusChange(status.value),
      })),
    [handleStatusChange, statusOptions],
  );

  useNumberedShortcuts(open, shortcutOptions);

  if (task && !canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            data-testid="task-status-trigger"
            variant="ghost"
            size="sm"
            /*
             * Status is a task property, not a bare toolbar link. Match the
             * outlined property-chip contract used by Start date, Due date,
             * Priority, Assign and Labels in the create-ticket modal.
             */
            className="h-7 justify-start gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            {selectedOption ? (
              <span className="relative inline-flex items-center justify-center">
                {getColumnIcon(
                  selectedOption.value,
                  selectedOption.isFinal,
                  selectedOption.icon,
                )}
                {isArchived && (
                  <Archive
                    aria-hidden="true"
                    className="absolute -bottom-1 -right-1.5 size-3 rounded-full bg-background text-muted-foreground"
                    data-testid="status-trigger-archived"
                  />
                )}
              </span>
            ) : (
              <Circle className="size-4 text-muted-foreground/60" />
            )}
            <span className="truncate text-xs font-semibold">
              {selectedOption
                ? getStatusDisplayLabel(
                    selectedOption.value,
                    selectedOption.label,
                  )
                : t("tasks:status.label")}
            </span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div>
          {isLoading ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {t("common:empty.loading")}
            </div>
          ) : isError ? (
            <div className="p-3 text-center text-sm text-destructive">
              {t("common:error.title")}
            </div>
          ) : (
            <>
              {statusOptions.map((status, index) => (
                <Button
                  key={status.value}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 h-8 px-2 rounded-none first:rounded-t-md"
                  onClick={() => handleStatusChange(status.value)}
                >
                  {getColumnIcon(status.value, status.isFinal, status.icon)}
                  <span className="text-sm">
                    {getStatusDisplayLabel(status.value, status.label)}
                  </span>
                  {currentStatus === status.value ? (
                    <Check className="ml-auto h-4 w-4" />
                  ) : (
                    <ShortcutNumber number={index + 1} />
                  )}
                </Button>
              ))}
              <div
                className="my-1 h-px bg-border"
                data-testid="status-divider"
              />
              {virtualActions.map((action) => (
                <Button
                  key={action.value}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 h-8 px-2 rounded-none last:rounded-b-md"
                  onClick={() => handleStatusChange(action.value)}
                >
                  {action.icon}
                  <span className="text-sm">{action.label}</span>
                  {currentStatus === action.value && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </Button>
              ))}
              {task && (
                <Button
                  data-testid="task-archive-action"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 h-8 px-2 rounded-none last:rounded-b-md"
                  onClick={handleArchiveToggle}
                >
                  <Archive className="size-4 text-muted-foreground" />
                  <span className="text-sm">
                    {isArchived
                      ? t("tasks:actions.unarchive")
                      : t("tasks:actions.archive")}
                  </span>
                  {isArchived && <Check className="ml-auto h-4 w-4" />}
                </Button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
