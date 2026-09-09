import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { Diamond, GitMerge, GitPullRequest } from "lucide-react";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TaskFlagBadges from "@/components/flag/task-flag-badges";
import TaskHoverPreview, {
  TASK_PREVIEW_CLOSE_DELAY,
  TASK_PREVIEW_OPEN_DELAY,
} from "@/components/kanban-board/task-hover-preview";
import SubtaskOfBadge from "@/components/task/subtask-of-badge";
import TaskAssigneeAvatar from "@/components/task/task-assignee-avatar";
import TaskDueDateBadge from "@/components/task/task-due-date-badge";
import TaskResourceIndicators from "@/components/task/task-resource-indicators";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
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
import { Button } from "../ui/button";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";

import TaskCardContextMenuContent from "./task-card-context-menu/task-card-context-menu-content";
import TaskCardLabels from "./task-labels";

type TaskCardProps = {
  task: Task;
  disableDragDrop?: boolean;
};

export const TaskCardContent = memo(function TaskCardContent({
  task,
  disableDragDrop = false,
  isDragging,
}: TaskCardProps & { isDragging: boolean }) {
  const { t } = useTranslation();

  const boardId = useBoardStore((state) => state.board?.id);
  const boardSlug = useBoardStore((state) => state.board?.slug);
  const { data: organization } = useActiveOrganization();
  const { mutateAsync: deleteTask } = useDeleteTask();
  const navigate = useNavigate();
  const showAssignees = useUserPreferencesStore((state) => state.showAssignees);
  const showPriority = useUserPreferencesStore((state) => state.showPriority);
  const showDueDates = useUserPreferencesStore((state) => state.showDueDates);
  const showLabels = useUserPreferencesStore((state) => state.showLabels);
  const showTaskNumbers = useUserPreferencesStore(
    (state) => state.showTaskNumbers,
  );
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  // From the board payload — fetching per card cost one request + preflight
  // each (186 on a 180-task board).
  const externalLinks = task.externalLinks;
  const toggleSelection = useBulkSelectionStore(
    (state) => state.toggleSelection,
  );
  const isTaskSelected = useBulkSelectionStore((state) =>
    state.selectedTaskIds.has(task.id),
  );
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

  function handleTaskCardClick(
    e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ) {
    if (!boardId || !task || !organization) return;

    if ((e as React.MouseEvent).metaKey || (e as React.KeyboardEvent).ctrlKey) {
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
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      toggleSelection(task.id);
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
    <>
      {/* The menu content is mounted eagerly on purpose. Base UI reads the
          menu's children synchronously when the contextmenu event fires, so
          deferring it via onOpenChange means the first right-click opens
          nothing. Only the delete dialog below is safe to mount lazily. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* #60: the preview wraps the whole card so hovering anywhere on it
              opens the info popover. The component existed but was never
              mounted, so neither the preview nor its delay did anything. */}
          <TaskHoverPreview
            assigneeImage={undefined}
            assigneeName={task.assigneeName ?? undefined}
            boardSlug={boardSlug}
            isDragging={isDragging}
            task={task}
          >
            {/** biome-ignore lint/a11y/noStaticElementInteractions: false positive for onClick and onKeyDown */}
            <div
              onClick={handleTaskCardClick}
              className={`group relative rounded-lg border bg-background p-3 shadow-xs/5 transition-[background-color,border-color,box-shadow,scale,translate] duration-150 ease-out active:scale-[0.98] motion-safe:hover:-translate-y-0.5 ${
                disableDragDrop ? "cursor-default" : "cursor-move"
              } ${
                isDragging
                  ? "border-ring/40 bg-card shadow-lg"
                  : "hover:border-border/90 hover:bg-background hover:shadow-md"
              } ${
                isTaskSelected
                  ? "border-ring/40 bg-accent/50 shadow-sm ring-1 ring-inset ring-ring/30"
                  : "border-border"
              } ${isTaskFocused ? "ring-2 ring-inset ring-ring/50" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTaskCardClick(e);
                } else if (e.key === "Escape") {
                  handleKeyDown(e);
                }
              }}
            >
              {(showTaskNumbers || task.milestoneName) && (
                <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/90">
                  {showTaskNumbers ? (
                    <span className="shrink-0 font-mono">
                      {boardSlug}-{task.number}
                    </span>
                  ) : null}
                  {task.milestoneName ? (
                    <span
                      className="inline-flex min-w-0 items-center gap-1 rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-indigo-400"
                      data-testid="task-card-milestone"
                      title={task.milestoneName}
                    >
                      <Diamond className="size-2.5 shrink-0 fill-current" />
                      <span className="truncate">{task.milestoneName}</span>
                    </span>
                  ) : null}
                </div>
              )}

              {/* Sits above the title so a child card reads as belonging to its
                parent before the reader parses the title. */}
              {task.parentTask && organization?.id && (
                <SubtaskOfBadge
                  boardId={task.boardId}
                  boardSlug={boardSlug}
                  className="mb-2"
                  organizationId={organization.id}
                  parent={task.parentTask}
                />
              )}

              {showAssignees && (
                <div className="absolute top-3 right-3">
                  <TaskAssigneeAvatar task={task} size="sm" />
                </div>
              )}

              <div className="mb-2.5 pr-6">
                <div
                  className="overflow-hidden break-words text-sm leading-5 font-medium text-foreground/95"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    wordBreak: "break-word",
                    hyphens: "auto",
                  }}
                >
                  {task.title}
                </div>
              </div>

              {showLabels && (
                <div className="mb-2.5">
                  <TaskCardLabels labels={task.labels} />
                </div>
              )}

              <div className="mb-2.5">
                <TaskFlagBadges flags={task.flags} />
              </div>

              <div className="flex items-center gap-1.5">
                <TaskResourceIndicators task={task} />
                <TodoProgressBadge description={task.description} />
                {showPriority && (
                  <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    {getPriorityIcon(task.priority ?? "")}
                  </span>
                )}

                {showDueDates && task.dueDate && (
                  <TaskDueDateBadge
                    completedAt={task.updatedAt}
                    dueDate={task.dueDate}
                    status={task.status}
                  />
                )}

                {pullRequests.length === 1 && (
                  <HoverCard
                    closeDelay={TASK_PREVIEW_CLOSE_DELAY}
                    openDelay={TASK_PREVIEW_OPEN_DELAY}
                  >
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(pullRequests[0].url, "_blank");
                        }}
                        className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                      >
                        {getPRInfo(pullRequests[0]).icon}
                        <span>#{pullRequests[0].externalId}</span>
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent
                      className="w-72 p-3"
                      side="bottom"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
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
                      <HoverCard
                        closeDelay={TASK_PREVIEW_CLOSE_DELAY}
                        openDelay={TASK_PREVIEW_OPEN_DELAY}
                      >
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground"
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
                          onPointerDown={(e) => e.stopPropagation()}
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
                                  onClick={() => window.open(pr.url, "_blank")}
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
          </TaskHoverPreview>
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

      {/* Mounted only while open: it's triggered from a menu item click, which
          happens on a later render, so lazy mounting is safe here. */}
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
    </>
  );
});

function TaskCard({ task, disableDragDrop = false }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: disableDragDrop });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),

    // Pointer updates arrive every frame. A 250ms transition queues stale
    // transforms behind the cursor and makes pickup/movement feel rubbery.
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0.6 : 1,
    touchAction: isDragging ? "none" : "auto",
    zIndex: isDragging ? 999 : "auto",
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
      <TaskCardContent
        disableDragDrop={disableDragDrop}
        isDragging={isDragging}
        task={task}
      />
    </div>
  );
}

export default TaskCard;
