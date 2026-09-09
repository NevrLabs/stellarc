import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { GitMerge, GitPullRequest } from "lucide-react";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SubtaskOfBadge from "@/components/task/subtask-of-badge";
import TaskAssigneeAvatar from "@/components/task/task-assignee-avatar";
import TaskDueDateBadge from "@/components/task/task-due-date-badge";
import { TodoProgressBadge } from "@/components/task/todo-progress-badge";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { cn } from "@/lib/cn";
import {
  intentPrefetchHandlers,
  prefetchTaskNavigation,
} from "@/lib/navigation-prefetch";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import TaskCardContextMenuContent from "../kanban-board/task-card-context-menu/task-card-context-menu-content";
import TaskCardLabels from "../kanban-board/task-labels";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";

type TaskRowProps = {
  task: Task;
  boardSlug: string;
  /** Status is structural information in list view and is never hideable. */
  statusBadge?: React.ReactNode;
};

export const TaskRowContent = memo(function TaskRowContent({
  task,
  boardSlug,
  statusBadge,
  isDragging,
}: TaskRowProps & { isDragging: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const boardId = useBoardStore((state) => state.board?.id);
  const { data: organization } = useActiveOrganization();
  const showAssignees = useUserPreferencesStore((state) => state.showAssignees);
  const showPriority = useUserPreferencesStore((state) => state.showPriority);
  const showDueDates = useUserPreferencesStore((state) => state.showDueDates);
  const showLabels = useUserPreferencesStore((state) => state.showLabels);
  const showTaskNumbers = useUserPreferencesStore(
    (state) => state.showTaskNumbers,
  );
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  const { mutateAsync: deleteTask } = useDeleteTask();
  // From the board payload — fetching per card cost one request + preflight
  // each (186 on a 180-task board).
  const externalLinks = task.externalLinks;
  const toggleSelection = useBulkSelectionStore(
    (state) => state.toggleSelection,
  );
  const isTaskSelected = useBulkSelectionStore((state) =>
    state.selectedTaskIds.has(task.id),
  );
  const isSelectMode = useBulkSelectionStore((state) => state.isSelectMode);
  const isTaskFocused = useBulkSelectionStore(
    (state) => state.focusedTaskId === task.id,
  );

  const pullRequests = useMemo(() => {
    if (!externalLinks) return [];
    return externalLinks.filter((link) => link.resourceType === "pull_request");
  }, [externalLinks]);

  const getPRInfo = (pr: (typeof pullRequests)[number]) => {
    const isMerged = pr.metadata?.merged === true;
    const isDraft = pr.metadata?.draft === true;

    if (isMerged) {
      return {
        icon: <GitMerge className="h-3 w-3 text-info-foreground" />,
        status: t("tasks:pr.merged"),
        statusClass: "text-info-foreground",
      };
    }

    if (isDraft) {
      return {
        icon: <GitPullRequest className="h-3 w-3 text-muted-foreground" />,
        status: t("tasks:pr.draft"),
        statusClass: "text-muted-foreground",
      };
    }

    return {
      icon: <GitPullRequest className="h-3 w-3 text-success-foreground" />,
      status: t("tasks:pr.open"),
      statusClass: "text-success-foreground",
    };
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!boardId || !task) return;
    if (e.defaultPrevented) return;
    if (
      (e.target as Element).closest(
        '[data-slot="checkbox"], input[type="checkbox"]',
      )
    )
      return;

    if (isSelectMode) {
      e.preventDefault();
      toggleSelection(task.id);
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleSelection(task.id);
      return;
    }

    const currentParams = new URLSearchParams(window.location.search);
    const currentTaskId = currentParams.get("taskId");

    if (currentTaskId === task.id) {
      navigate({
        to: ".",
        search: {},
      });
    } else {
      navigate({
        to: ".",
        search: { taskId: task.id },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleClick(e as unknown as React.MouseEvent);
    }
  };

  const handleDeleteTask = async () => {
    try {
      await deleteTask(task.id);
      queryClient.invalidateQueries({
        queryKey: ["tasks", boardId],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:delete.error"),
      );
    } finally {
      toast.success(t("tasks:delete.success"));
    }
  };

  return (
    <div
      className={cn(
        "border-b border-border/50 transition-colors duration-150",
        isDragging && "opacity-50",
        isTaskSelected &&
          "bg-accent/60 shadow-sm ring-1 ring-inset ring-ring/30",
        isTaskFocused && "ring-2 ring-inset ring-ring/50",
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: false positive for onClick and onKeyDown */}
          <div
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={cn(
              "group relative flex items-center gap-3 px-4 py-1.5 transition-colors cursor-pointer",
              isTaskSelected ? "bg-accent/45" : "hover:bg-accent/60",
            )}
          >
            {showPriority && (
              <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
                {getPriorityIcon(task.priority ?? "")}
              </div>
            )}
            {isSelectMode && (
              <Checkbox
                aria-label={`Select ${task.title}`}
                checked={isTaskSelected}
                onCheckedChange={() => toggleSelection(task.id)}
              />
            )}
            {/* Status leads the row, immediately left of the ticket ID: it is
                structural metadata, so it belongs with priority and the ID
                rather than trailing after the title with labels and PRs, where
                its position drifted with title length. */}
            {statusBadge}
            {showTaskNumbers && (
              <div className="text-xs font-mono text-muted-foreground flex-shrink-0">
                {boardSlug}-{task.number}
              </div>
            )}

            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="flex items-center gap-2 justify-between w-full">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-sm text-foreground truncate">
                    {task.title}
                  </span>
                  {/* Inline beside the title: a list row has no second line to
                      spend, and the badge already reads as secondary. */}
                  {task.parentTask && organization?.id && (
                    <SubtaskOfBadge
                      boardId={task.boardId}
                      boardSlug={boardSlug}
                      organizationId={organization.id}
                      parent={task.parentTask}
                    />
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {showLabels && <TaskCardLabels labels={task.labels} />}

                  {pullRequests.length === 1 && (
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(pullRequests[0].url, "_blank");
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-sidebar text-[10px] font-medium text-muted-foreground"
                        >
                          {getPRInfo(pullRequests[0]).icon}
                          <span>#{pullRequests[0].externalId}</span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-72 p-3"
                        side="bottom"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {getPRInfo(pullRequests[0]).icon}
                            <span>{getPRInfo(pullRequests[0]).status}</span>
                            <span className="text-muted-foreground/50">•</span>
                            <span>#{pullRequests[0].externalId}</span>
                          </div>
                          <p className="text-sm font-medium leading-snug">
                            {pullRequests[0].title || t("tasks:pr.label")}
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )}

                  {pullRequests.length > 1 &&
                    (() => {
                      const hasOpen = pullRequests.some(
                        (pr) => !pr.metadata?.merged && !pr.metadata?.draft,
                      );
                      const allMerged = pullRequests.every(
                        (pr) => pr.metadata?.merged,
                      );
                      const iconColor = allMerged
                        ? "text-info-foreground"
                        : hasOpen
                          ? "text-success-foreground"
                          : "text-muted-foreground";

                      return (
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-sidebar text-[10px] font-medium text-muted-foreground"
                            >
                              <GitPullRequest
                                className={`h-3 w-3 ${iconColor}`}
                              />
                              <span>
                                {t("tasks:pr.count", {
                                  count: pullRequests.length,
                                })}
                              </span>
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent
                            className="w-auto min-w-56 max-w-96 p-1"
                            side="bottom"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {pullRequests.map((pr, index) => {
                              const prInfo = getPRInfo(pr);
                              const repoMatch = pr.url.match(
                                /github\.com\/([^/]+\/[^/]+)\/pull/,
                              );
                              const repoName = repoMatch ? repoMatch[1] : null;
                              return (
                                <div key={pr.id}>
                                  {index > 0 && (
                                    <hr className="border-border my-1" />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      window.open(pr.url, "_blank")
                                    }
                                    className="w-full px-2 py-1.5 text-left hover:bg-muted/50 rounded transition-colors"
                                  >
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      {prInfo.icon}
                                      <span>
                                        {repoName}#{pr.externalId}
                                      </span>
                                    </div>
                                    <p className="text-xs leading-tight line-clamp-2 mt-0.5">
                                      {pr.title || t("tasks:pr.label")}
                                    </p>
                                    <span className="text-[10px] text-muted-foreground">
                                      {prInfo.status}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </HoverCardContent>
                        </HoverCard>
                      );
                    })()}
                </div>
              </div>
            </div>

            {showDueDates && task.dueDate && (
              <TaskDueDateBadge
                completedAt={task.updatedAt}
                dueDate={task.dueDate}
                status={task.status}
                className="shrink-0"
              />
            )}

            <TodoProgressBadge
              description={task.description}
              className="shrink-0"
            />

            {showAssignees && (
              <div className="flex-shrink-0">
                <TaskAssigneeAvatar task={task} />
              </div>
            )}
          </div>
        </ContextMenuTrigger>

        {boardId && organization && (
          <TaskCardContextMenuContent
            task={task}
            taskCardContext={{
              boardId,
              worskpaceId: organization.id,
            }}
            onDeleteClick={() => setIsDeleteTaskModalOpen(true)}
          />
        )}
      </ContextMenu>

      {isDeleteTaskModalOpen && (
        <AlertDialog
          open={isDeleteTaskModalOpen}
          onOpenChange={setIsDeleteTaskModalOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("tasks:delete.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("tasks:delete.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose>
                <Button variant="outline" size="sm">
                  {t("common:actions.cancel")}
                </Button>
              </AlertDialogClose>
              <AlertDialogClose onClick={handleDeleteTask}>
                <Button variant="destructive" size="sm">
                  {t("tasks:delete.action")}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
});

function TaskRow({ task, boardSlug, statusBadge }: TaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)",
    touchAction: isDragging ? "none" : "auto",
    ...(isDragging
      ? {}
      : {
          contentVisibility: "auto",
          containIntrinsicSize: "auto 34px",
        }),
  };

  return (
    <div
      data-task-id={task.id}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...intentPrefetchHandlers(() =>
        prefetchTaskNavigation(queryClient, task.id),
      )}
    >
      <TaskRowContent
        boardSlug={boardSlug}
        isDragging={isDragging}
        statusBadge={statusBadge}
        task={task}
      />
    </div>
  );
}

export default TaskRow;
