import { X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useSetTaskArchived } from "@/hooks/mutations/task/use-set-task-archived";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import { useUpdateTaskDescription } from "@/hooks/mutations/task/use-update-task-description";
import { useUpdateTaskDueDate } from "@/hooks/mutations/task/use-update-task-due-date";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import { useUpdateTaskPriority } from "@/hooks/mutations/task/use-update-task-status-priority";
import { useUpdateTaskTitle } from "@/hooks/mutations/task/use-update-task-title";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getColumnIcon } from "@/lib/column";
import { generateLink } from "@/lib/generate-link";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";
import type Task from "@/types/task";

type TaskCardContext = {
  worskpaceId: string;
  boardId: string;
};

type TaskCardContextMenuContentProps = {
  task: Task;
  taskCardContext: TaskCardContext;
  onDeleteClick: () => void;
  /**
   * Only provided where the task is rendered as part of a relation (a subtask
   * row, a relation row). Kanban cards have no relation to unlink, so the item
   * is absent there rather than shown disabled.
   */
  onUnlink?: () => void;
  /** Label for the unlink action, e.g. "Unlink subtask" vs "Unlink relation". */
  unlinkLabel?: string;
};

export default function TaskCardContextMenuContent({
  task,
  taskCardContext,
  onDeleteClick,
  onUnlink,
  unlinkLabel,
}: TaskCardContextMenuContentProps) {
  const { t } = useTranslation();
  const { board } = useBoardStore();
  const { data: organization } = useActiveOrganization();
  const { data: columnsData = [] } = useGetColumns(taskCardContext.boardId);
  const columns =
    board?.columns && board.columns.length > 0
      ? board.columns.map((col) => ({
          slug: col.id,
          name: col.name,
          icon: col.icon,
          isFinal: col.isFinal,
        }))
      : columnsData.map((col) => ({
          slug: col.slug,
          name: col.name,
          icon: col.icon,
          isFinal: col.isFinal,
        }));
  const { data: organizationMembers } = useGetActiveOrganizationMembers(
    taskCardContext.worskpaceId,
  );
  const { mutateAsync: updateTask } = useUpdateTask();
  const { mutateAsync: updateTaskPriority } = useUpdateTaskPriority();
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();
  const { mutateAsync: updateTaskAssignee } = useUpdateTaskAssignee();
  const { mutateAsync: updateTaskTitle } = useUpdateTaskTitle();
  const { mutateAsync: updateTaskDescription } = useUpdateTaskDescription();
  const { mutateAsync: updateTaskDueDate } = useUpdateTaskDueDate();
  const { mutateAsync: setArchived } = useSetTaskArchived();
  const { canManageTasks, canAssignTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();
  const canAssign = canAssignTasks();

  const usersOptions = useMemo(() => {
    return organizationMembers?.members?.map((member) => ({
      label: member?.user?.name ?? member.userId,
      value: member.userId,
      image: member?.user?.image ?? "",
      name: member?.user?.name ?? "",
      email: member?.user?.email ?? "",
    }));
  }, [organizationMembers]);

  const handleCopyTaskLink = () => {
    const orgSlug = organization?.slug ?? taskCardContext.worskpaceId;
    const boardKey = board?.slug ?? "";
    const ticketKey =
      boardKey && task.number
        ? `${boardKey.toUpperCase()}-${task.number}`
        : task.id;
    const path = `/dashboard/${orgSlug}/tickets/${ticketKey}`;
    const taskLink = generateLink(path);

    navigator.clipboard.writeText(taskLink);
    toast.success(t("tasks:contextMenu.copyLinkSuccess"));
  };

  const handleChange = async (field: keyof Task, value: string | Date) => {
    try {
      switch (field) {
        case "priority":
          await updateTaskPriority({ ...task, priority: value as string });
          break;
        case "status":
          await updateTaskStatus({ ...task, status: value as string });
          break;
        case "userId":
          await updateTaskAssignee({ ...task, userId: value as string });
          break;
        case "title":
          await updateTaskTitle({ ...task, title: value as string });
          break;
        case "description":
          await updateTaskDescription({
            ...task,
            description: value as string,
          });
          break;
        default:
          await updateTask({
            ...task,
            [field]: value,
          });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:update.error"),
      );
    } finally {
      toast.success(t("tasks:update.success"));
    }
  };

  return (
    <ContextMenuContent className="w-46">
      <ContextMenuItem onClick={handleCopyTaskLink}>
        <span>{t("tasks:contextMenu.copyLink")}</span>
      </ContextMenuItem>

      {(canEdit || canAssign) && <ContextMenuSeparator />}

      {canEdit && (
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <span>{t("tasks:priority.label")}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuCheckboxItem
              key="no-priority"
              checked={task.priority === "no-priority"}
              onCheckedChange={() => handleChange("priority", "no-priority")}
              closeOnClick
              className="[&_svg]:text-muted-foreground"
            >
              {getPriorityIcon("no-priority")}
              <span>{getPriorityLabel("no-priority")}</span>
            </ContextMenuCheckboxItem>
            {["low", "medium", "high", "urgent"].map((priority) => (
              <ContextMenuCheckboxItem
                key={priority}
                checked={task.priority === priority}
                onCheckedChange={() => handleChange("priority", priority)}
                closeOnClick
                className="[&_svg]:text-muted-foreground"
              >
                {getPriorityIcon(priority)}
                <span className="capitalize">{getPriorityLabel(priority)}</span>
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {canEdit && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span>{t("tasks:status.label")}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {columns.map((col) => (
              <ContextMenuCheckboxItem
                key={col.slug}
                checked={task.status === col.slug}
                onCheckedChange={() => handleChange("status", col.slug)}
                closeOnClick
                className="[&_svg]:text-muted-foreground"
              >
                {getColumnIcon(col.slug, col.isFinal, col.icon)}
                <span>{col.name}</span>
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {canEdit && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span>{t("tasks:dueDate.label")}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-fit min-w-0 p-0">
            <div className="p-2">
              <Calendar
                mode="single"
                selected={task.dueDate ? new Date(task.dueDate) : undefined}
                onSelect={async (date) => {
                  try {
                    await updateTaskDueDate({
                      ...task,
                      dueDate: date?.toISOString() || null,
                    });
                    toast.success(t("tasks:dueDate.updateSuccess"));
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t("tasks:dueDate.updateError"),
                    );
                  }
                }}
                className="w-full bg-popover!"
              />
            </div>
            {task.dueDate && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="gap-2 text-muted-foreground"
                  onClick={async () => {
                    try {
                      await updateTaskDueDate({
                        ...task,
                        dueDate: null,
                      });
                      toast.success(t("tasks:dueDate.clearSuccess"));
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : t("tasks:dueDate.clearError"),
                      );
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                  <span>{t("tasks:dueDate.clear")}</span>
                </ContextMenuItem>
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {canAssign && usersOptions && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span>{t("tasks:assignee.label")}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuCheckboxItem
              checked={!task.userId}
              onCheckedChange={() => handleChange("userId", "")}
              closeOnClick
            >
              <div
                className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center"
                title={t("tasks:assignee.unassigned")}
              >
                <span className="text-[10px] font-medium text-muted-foreground">
                  ?
                </span>{" "}
              </div>
              {t("tasks:assignee.unassigned")}
            </ContextMenuCheckboxItem>
            {usersOptions.map((user) => (
              <ContextMenuCheckboxItem
                key={user.value}
                checked={task.userId === user.value}
                onCheckedChange={() => handleChange("userId", user.value ?? "")}
                closeOnClick
              >
                <Avatar
                  className={`h-6 w-6 ${getAvatarTone(user.value, user.email)}`}
                >
                  <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
                  <AvatarFallback className="bg-transparent text-xs font-medium border border-border/30">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>

                {user.label}
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {canEdit && (
        <>
          <ContextMenuSeparator />

          {/*
            #226: archival writes `task.archived_at`, NOT status. This used to
            call handleChange("status", "archived"), which now 400s because
            "archived" is not a valid status.
          */}
          <ContextMenuItem
            data-testid="context-menu-archive"
            onClick={() => {
              setArchived({
                taskId: task.id,
                archived: !task.archivedAt,
                boardId: task.boardId,
              }).catch((error) => {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : t("tasks:archive.error"),
                );
              });
            }}
          >
            <span>
              {task.archivedAt
                ? t("tasks:actions.unarchive")
                : t("tasks:actions.archive")}
            </span>
          </ContextMenuItem>

          <ContextMenuItem onClick={() => handleChange("status", "planned")}>
            <span>{t("tasks:actions.markAsPlanned")}</span>
          </ContextMenuItem>

          {onUnlink && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setTimeout(() => {
                    onUnlink();
                  }, 0);
                }}
              >
                <span>{unlinkLabel ?? t("tasks:actions.unlink")}</span>
              </ContextMenuItem>
            </>
          )}

          <ContextMenuSeparator />

          <ContextMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.preventDefault();
              setTimeout(() => {
                onDeleteClick();
              }, 0);
            }}
          >
            <span>{t("tasks:actions.delete")}</span>
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
}
