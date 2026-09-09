import { useParams } from "@tanstack/react-router";
import {
  Archive,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Copy,
  GitBranch,
  Github,
  Plus,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveLabelColor } from "@/constants/label-colors";
import useGetBoard from "@/hooks/queries/board/use-get-board";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useGetGithubIntegration from "@/hooks/queries/github-integration/use-get-github-integration";
import useGetLabelsByTask from "@/hooks/queries/label/use-get-labels-by-task";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import useGetTask from "@/hooks/queries/task/use-get-task";

import { getAvatarTone } from "@/lib/avatar-tone";
import { generateBranchName } from "@/lib/branch-name";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { dueDateStatusColors, getDueDateStatus } from "@/lib/due-date-status";
import { formatDateShort } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel, getStatusDisplayLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { resolveAssignee } from "@/lib/resolve-assignee";
import { toast } from "@/lib/toast";
import {
  canSelectLabelSource,
  isRepoLabel,
  labelSourceAttribute,
} from "./label-source";
import TaskAssigneePopover from "./task-assignee-popover";
import TaskDueDatePopover from "./task-due-date-popover";
import TaskFollowToggle from "./task-follow-toggle";
import TaskLabelsPopover from "./task-labels-popover";
import TaskLabelsRow from "./task-labels-row";
import TaskMovePopover from "./task-move-popover";
import TaskPriorityPopover from "./task-priority-popover";
import TaskStartDatePopover from "./task-start-date-popover";
import TaskStatusPopover from "./task-status-popover";

type TaskPropertiesSidebarProps = {
  taskId: string | undefined;
  boardId: string;
  organizationId: string;
  className?: string;
  compact?: boolean;
};

export default function TaskPropertiesSidebar({
  taskId,
  boardId,
  organizationId,
  className,
  compact = false,
}: TaskPropertiesSidebarProps) {
  const { t } = useTranslation();
  const { data: task } = useGetTask(taskId ?? "");

  const { data: board } = useGetBoard({ id: boardId, organizationId });
  const { data: columns = [] } = useGetColumns(boardId);
  const { data: organizationMembers } =
    useGetActiveOrganizationMembers(organizationId);
  const { data: taskLabels = [] } = useGetLabelsByTask(taskId ?? "");
  const { data: boardIntegration } = useGetGithubIntegration(boardId);
  const visibleTaskLabels = taskLabels.filter((label) =>
    canSelectLabelSource(label.source, Boolean(boardIntegration)),
  );
  const { data: organizationBoards = [] } = useGetBoards({ organizationId });
  // Milestone and flag controls live together in the task-detail topbar.
  const canMoveTask =
    Boolean(task) && organizationBoards.some((p) => p.id !== task?.boardId);
  const statusColumn = columns.find(
    (column: { id: string; slug?: string }) =>
      column.slug === task?.status || column.id === task?.status,
  );
  const statusLabel = getStatusDisplayLabel(
    task?.status ?? "",
    statusColumn?.name,
  );
  const statusIsFinal = statusColumn?.isFinal ?? false;
  const statusIcon = statusColumn?.icon;

  const boardSlug = board?.slug;
  const { organizationSlug: orgSlug } = useParams({ strict: false });
  const taskNumber = task?.number;
  // Branch names are a task convenience only. They no longer imply a board
  // GitHub/Gitea integration: Repos are a separate, org-level domain.
  const branchPattern = "{slug}-{number}";

  const assignee = organizationMembers?.members?.find(
    (member) => member.userId === task?.userId,
  );
  const assigneeTone = getAvatarTone(task?.userId, assignee?.user?.email);
  // A task can be assigned to a USER or a TEAM (mutually exclusive columns).
  // Every site here used to branch on `task.userId` alone, so a team assignment
  // rendered "Unassigned". See lib/resolve-assignee.
  const {
    label: assigneeLabel,
    hasAssignee,
    teamName: teamAssigneeName,
  } = resolveAssignee({
    task,
    memberName: assignee?.user?.name,
    unassignedLabel: t("tasks:popover.assignee.unassigned"),
    teamFallbackLabel: t("tasks:popover.assignee.team"),
  });

  const handleCopyTaskLink = () => {
    const ticketKey =
      board?.slug && task?.number
        ? `${board.slug.toUpperCase()}-${task.number}`
        : taskId;
    navigator.clipboard.writeText(
      `${window.location.origin}/dashboard/${orgSlug ?? organizationId}/tickets/${ticketKey}`,
    );
    toast.message(t("tasks:properties.copyTaskLink"));
  };

  const handleCopyTaskBranch = () => {
    const branchName = generateBranchName(
      branchPattern,
      boardSlug,
      taskNumber,
      task?.title,
    );
    navigator.clipboard.writeText(branchName);
    toast.message(t("tasks:properties.copyTaskBranch"));
  };

  return (
    <div className={className} data-slot="task-properties-sidebar">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* Compact mode: properties + icons in one row */}
        {compact && (
          <div className="flex flex-row-reverse gap-2 w-full border-b border-border">
            <div className="flex px-3 py-2">
              {task && canMoveTask && (
                <TaskMovePopover
                  task={task}
                  organizationId={organizationId}
                  triggerClassName="rounded-l-md rounded-r-none border-r-0"
                />
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "text-foreground border-r-0",
                        canMoveTask ? "rounded-none" : "rounded-r-none",
                      )}
                      onClick={() => handleCopyTaskLink()}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <KbdSequence
                      keys={["Ctrl", "Shift", "C"]}
                      description={t("tasks:properties.copyTaskLink")}
                      separator=""
                    />
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-foreground rounded-none border-r-0"
                      data-testid="copy-task-branch"
                      onClick={() => handleCopyTaskBranch()}
                    >
                      <GitBranch className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <KbdSequence
                      keys={["Ctrl", "Shift", "G"]}
                      description={t("tasks:properties.copyTaskBranch")}
                      separator=""
                    />
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TaskFollowToggle
                      taskId={taskId}
                      className="rounded-l-none"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("tasks:properties.follow")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex flex-row flex-wrap gap-1 items-center p-2 w-full">
              {task && (
                <TaskStatusPopover task={task}>
                  <Button
                    data-testid="task-status-trigger"
                    variant="ghost"
                    size="sm"
                    className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                  >
                    <span className="relative inline-flex items-center justify-center">
                      {getColumnIcon(
                        task.status ?? "",
                        statusIsFinal,
                        statusIcon,
                      )}
                      {task.archivedAt && (
                        <Archive
                          aria-hidden="true"
                          className="absolute -bottom-1 -right-1.5 size-3 rounded-full bg-background text-muted-foreground"
                          data-testid="detail-status-archived"
                        />
                      )}
                    </span>
                    <span className="text-xs font-semibold truncate">
                      {statusLabel}
                    </span>
                  </Button>
                </TaskStatusPopover>
              )}
              {task && (
                <TaskPriorityPopover task={task}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                  >
                    {getPriorityIcon(task.priority ?? "")}
                    <span className="text-xs font-semibold truncate">
                      {getPriorityLabel(task.priority ?? "")}
                    </span>
                  </Button>
                </TaskPriorityPopover>
              )}
              {task && (
                <TaskAssigneePopover
                  task={task}
                  organizationId={organizationId}
                >
                  <Button
                    data-testid="task-assignee-trigger"
                    variant="ghost"
                    size="sm"
                    className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                  >
                    {teamAssigneeName ? (
                      <div
                        className="flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-full border border-border/30 bg-muted"
                        title={teamAssigneeName}
                      >
                        <Users className="h-2.5 w-2.5" />
                      </div>
                    ) : hasAssignee ? (
                      <Avatar className={cn("h-[16px] w-[16px]", assigneeTone)}>
                        <AvatarImage
                          src={assignee?.user?.image ?? ""}
                          alt={assignee?.user?.name || ""}
                        />
                        <AvatarFallback className="bg-transparent text-[9px] font-medium border border-border/30 flex-shrink-0 h-[16px] w-[16px]">
                          {getInitials(
                            assignee?.user?.name || task.assigneeName,
                          )}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div
                        className="w-[16px] h-[16px] rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0"
                        title={t("tasks:popover.assignee.unassigned")}
                      >
                        <span className="text-[8px] font-medium">?</span>
                      </div>
                    )}
                    <span className="text-xs font-semibold truncate max-w-[100px]">
                      {assigneeLabel}
                    </span>
                  </Button>
                </TaskAssigneePopover>
              )}
              {task && (
                <TaskStartDatePopover task={task}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                  >
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                    <span
                      className={`text-xs font-semibold ${task.startDate ? "" : "text-muted-foreground"}`}
                    >
                      {task.startDate
                        ? formatDateShort(task.startDate)
                        : t("tasks:properties.start")}
                    </span>
                  </Button>
                </TaskStartDatePopover>
              )}
              {task && (
                <TaskDueDatePopover task={task}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                  >
                    {task.dueDate ? (
                      <>
                        {getDueDateStatus(task.dueDate) === "overdue" && (
                          <CalendarX
                            className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                          />
                        )}
                        {getDueDateStatus(task.dueDate) === "due-soon" && (
                          <CalendarClock
                            className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                          />
                        )}
                        {(getDueDateStatus(task.dueDate) === "far-future" ||
                          getDueDateStatus(task.dueDate) === "no-due-date") && (
                          <Calendar
                            className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                          />
                        )}
                        <span className="text-xs font-semibold">
                          {formatDateShort(task.dueDate)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t("tasks:properties.noDate")}
                        </span>
                      </>
                    )}
                  </Button>
                </TaskDueDatePopover>
              )}
              {/* KFL-339: personal notification subscription, never gated on edit rights. */}
            </div>
          </div>
        )}

        {!compact && (
          <>
            {/* Mobile: Compact-style layout */}
            <div className="flex flex-row-reverse gap-2 w-full border-b border-border lg:hidden">
              <div className="flex px-3 py-2">
                {task && canMoveTask && (
                  <TaskMovePopover
                    task={task}
                    organizationId={organizationId}
                    triggerClassName="rounded-l-md rounded-r-none border-r-0"
                  />
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-foreground border-r-0",
                          canMoveTask ? "rounded-none" : "rounded-r-none",
                        )}
                        onClick={() => handleCopyTaskLink()}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <KbdSequence
                        keys={["Ctrl", "Shift", "C"]}
                        description={t("tasks:properties.copyTaskLink")}
                        separator=""
                      />
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-foreground rounded-none border-r-0"
                        onClick={() => handleCopyTaskBranch()}
                      >
                        <GitBranch className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <KbdSequence
                        keys={["Ctrl", "Shift", "G"]}
                        description={t("tasks:properties.copyTaskBranch")}
                        separator=""
                      />
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TaskFollowToggle
                        taskId={taskId}
                        className="rounded-l-none"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("tasks:properties.follow")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex flex-row flex-wrap gap-1 items-center p-2 w-full">
                {task && (
                  <TaskStatusPopover task={task}>
                    <Button
                      data-testid="task-status-trigger"
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                    >
                      {getColumnIcon(
                        task.status ?? "",
                        statusIsFinal,
                        statusIcon,
                      )}
                      <span className="text-xs font-semibold truncate">
                        {statusLabel}
                      </span>
                    </Button>
                  </TaskStatusPopover>
                )}
                {task && (
                  <TaskPriorityPopover task={task}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                    >
                      {getPriorityIcon(task.priority ?? "")}
                      <span className="text-xs font-semibold truncate">
                        {getPriorityLabel(task.priority ?? "")}
                      </span>
                    </Button>
                  </TaskPriorityPopover>
                )}
                {task && (
                  <TaskAssigneePopover
                    task={task}
                    organizationId={organizationId}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                    >
                      {teamAssigneeName ? (
                        <div
                          className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border border-border/30 bg-muted"
                          title={teamAssigneeName}
                        >
                          <Users className="h-2.5 w-2.5" />
                        </div>
                      ) : hasAssignee ? (
                        <Avatar
                          className={cn("h-[16px] w-[16px]", assigneeTone)}
                        >
                          <AvatarImage
                            src={assignee?.user?.image ?? ""}
                            alt={assignee?.user?.name || ""}
                          />
                          <AvatarFallback className="bg-transparent text-[9px] font-medium border border-border/30 shrink-0 h-[16px] w-[16px]">
                            {getInitials(
                              assignee?.user?.name || task.assigneeName,
                            )}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div
                          className="w-[16px] h-[16px] rounded-full bg-muted border border-border flex items-center justify-center shrink-0"
                          title={t("tasks:popover.assignee.unassigned")}
                        >
                          <span className="text-[8px] font-medium">?</span>
                        </div>
                      )}
                      <span className="text-xs font-semibold truncate max-w-[100px]">
                        {assigneeLabel}
                      </span>
                    </Button>
                  </TaskAssigneePopover>
                )}
                {task && (
                  <TaskStartDatePopover task={task}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <span
                        className={`text-xs font-semibold ${task.startDate ? "" : "text-muted-foreground"}`}
                      >
                        {task.startDate
                          ? formatDateShort(task.startDate)
                          : t("tasks:properties.start")}
                      </span>
                    </Button>
                  </TaskStartDatePopover>
                )}
                {task && (
                  <TaskDueDatePopover task={task}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
                    >
                      {task.dueDate ? (
                        <>
                          {getDueDateStatus(task.dueDate) === "overdue" && (
                            <CalendarX
                              className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                            />
                          )}
                          {getDueDateStatus(task.dueDate) === "due-soon" && (
                            <CalendarClock
                              className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                            />
                          )}
                          {(getDueDateStatus(task.dueDate) === "far-future" ||
                            getDueDateStatus(task.dueDate) ===
                              "no-due-date") && (
                            <Calendar
                              className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                            />
                          )}
                          <span className="text-xs font-semibold">
                            {formatDateShort(task.dueDate)}
                          </span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">
                            {t("tasks:properties.noDate")}
                          </span>
                        </>
                      )}
                    </Button>
                  </TaskDueDatePopover>
                )}
                {/* KFL-339: personal notification subscription. */}
              </div>
            </div>

            {/* Desktop: Title + stacked properties */}
            <div className="hidden lg:block">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border lg:border-none">
                <p className="text-sm font-medium text-foreground/70 flex-1">
                  {t("tasks:properties.title")}
                </p>
                <div className="flex">
                  {task && canMoveTask && (
                    <TaskMovePopover
                      task={task}
                      organizationId={organizationId}
                      triggerClassName="rounded-l-md rounded-r-none border-r-0"
                    />
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-foreground border-r-0",
                            canMoveTask ? "rounded-none" : "rounded-r-none",
                          )}
                          onClick={() => handleCopyTaskLink()}
                        >
                          <Copy className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <KbdSequence
                          keys={["Ctrl", "Shift", "C"]}
                          description={t("tasks:properties.copyTaskLink")}
                          separator=""
                        />
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-foreground rounded-none border-r-0"
                          onClick={() => handleCopyTaskBranch()}
                        >
                          <GitBranch className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <KbdSequence
                          keys={["Ctrl", "Shift", "G"]}
                          description={t("tasks:properties.copyTaskBranch")}
                          separator=""
                        />
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TaskFollowToggle
                          taskId={taskId}
                          className="rounded-l-none"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("tasks:properties.follow")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="flex flex-col gap-2 px-3 py-3">
                {task && (
                  <TaskStatusPopover task={task}>
                    <Button
                      data-testid="task-status-trigger"
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 px-1.5 gap-1.5 w-full"
                    >
                      {getColumnIcon(
                        task.status ?? "",
                        statusIsFinal,
                        statusIcon,
                      )}
                      <span className="text-xs font-semibold truncate">
                        {statusLabel}
                      </span>
                    </Button>
                  </TaskStatusPopover>
                )}
                {task && (
                  <TaskPriorityPopover task={task}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 px-1.5 gap-1.5 w-full"
                    >
                      {getPriorityIcon(task.priority ?? "")}
                      <span className="text-xs font-semibold truncate">
                        {getPriorityLabel(task.priority ?? "")}
                      </span>
                    </Button>
                  </TaskPriorityPopover>
                )}
                {task && (
                  <TaskAssigneePopover
                    task={task}
                    organizationId={organizationId}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 px-1.5 gap-1.5 w-full"
                    >
                      {teamAssigneeName ? (
                        <div
                          className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border border-border/30 bg-muted"
                          title={teamAssigneeName}
                        >
                          <Users className="h-2.5 w-2.5" />
                        </div>
                      ) : hasAssignee ? (
                        <Avatar
                          className={cn("h-[16px] w-[16px]", assigneeTone)}
                        >
                          <AvatarImage
                            src={assignee?.user?.image ?? ""}
                            alt={assignee?.user?.name || ""}
                          />
                          <AvatarFallback className="bg-transparent text-[9px] font-medium border border-border/30 shrink-0 h-[16px] w-[16px]">
                            {getInitials(
                              assignee?.user?.name || task.assigneeName,
                            )}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div
                          className="w-[16px] h-[16px] rounded-full bg-muted border border-border flex items-center justify-center shrink-0"
                          title={t("tasks:popover.assignee.unassigned")}
                        >
                          <span className="text-[8px] font-medium">?</span>
                        </div>
                      )}
                      <span className="text-xs font-semibold truncate max-w-[100px]">
                        {assigneeLabel}
                      </span>
                    </Button>
                  </TaskAssigneePopover>
                )}
                {task && (
                  <TaskStartDatePopover task={task}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 px-1.5 gap-1.5 w-full"
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <span
                        className={`text-xs font-semibold ${task.startDate ? "" : "text-muted-foreground"}`}
                      >
                        {task.startDate
                          ? formatDateShort(task.startDate)
                          : t("tasks:properties.startDate")}
                      </span>
                    </Button>
                  </TaskStartDatePopover>
                )}
                {task && (
                  <TaskDueDatePopover task={task}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start h-7 px-1.5 gap-1.5 w-full"
                    >
                      {task.dueDate ? (
                        <>
                          {getDueDateStatus(task.dueDate) === "overdue" && (
                            <CalendarX
                              className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                            />
                          )}
                          {getDueDateStatus(task.dueDate) === "due-soon" && (
                            <CalendarClock
                              className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                            />
                          )}
                          {(getDueDateStatus(task.dueDate) === "far-future" ||
                            getDueDateStatus(task.dueDate) ===
                              "no-due-date") && (
                            <Calendar
                              className={`w-3.5 h-3.5 ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                            />
                          )}
                          <span className="text-xs font-semibold">
                            {formatDateShort(task.dueDate)}
                          </span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">
                            {t("tasks:properties.noDate")}
                          </span>
                        </>
                      )}
                    </Button>
                  </TaskDueDatePopover>
                )}
              </div>
            </div>
          </>
        )}

        <div className="hidden lg:flex min-w-0 flex-col gap-3 p-2">
          <TaskLabelsRow label={t("tasks:properties.labels")}>
            {task &&
              visibleTaskLabels.length > 0 &&
              visibleTaskLabels.map(
                (label: {
                  id: string;
                  name: string;
                  color: string;
                  source?: "kaneo" | "repo";
                }) => (
                  <TaskLabelsPopover
                    key={`edit-${label.id}`}
                    task={task}
                    organizationId={organizationId}
                    triggerNativeButton={false}
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "flex cursor-pointer items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors hover:bg-accent/50",
                        isRepoLabel(label.source) && "opacity-60",
                      )}
                      data-label-source={labelSourceAttribute(label.source)}
                      title={
                        isRepoLabel(label.source)
                          ? `${label.name} — ${t("tasks:labels.fromRepository")}`
                          : label.name
                      }
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: resolveLabelColor(label.color),
                        }}
                      />
                      <span className="truncate max-w-[60px]">
                        {label.name}
                      </span>
                      {/*
                        #147: repo-owned labels carry the source mark, Kaneo
                        labels carry nothing. Deliberately an icon rather than
                        a second text label next to the name.
                      */}
                      {isRepoLabel(label.source) && (
                        <>
                          <Github
                            aria-hidden="true"
                            className="size-2.5 shrink-0 opacity-60"
                            data-testid="label-repo-mark"
                          />
                          <span className="sr-only">
                            {t("tasks:labels.fromRepository")}
                          </span>
                        </>
                      )}
                    </Badge>
                  </TaskLabelsPopover>
                ),
              )}

            {task && (
              <TaskLabelsPopover task={task} organizationId={organizationId}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 rounded-full"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </TaskLabelsPopover>
            )}
          </TaskLabelsRow>
          {/*
            #75: no synced-issue block under the label list. You asked for it in
            the status bar and the Resources list only — repeating it here was
            the "way too many repeated info" the ticket opened with.
          */}
        </div>
      </div>
    </div>
  );
}
