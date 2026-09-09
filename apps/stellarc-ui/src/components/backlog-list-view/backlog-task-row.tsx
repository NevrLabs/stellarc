import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";

import { type CSSProperties, memo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import useBacklogBulkSelectionStore from "@/store/backlog-bulk-selection";
import useBoardStore from "@/store/board";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import TaskCardContextMenuContent from "../kanban-board/task-card-context-menu/task-card-context-menu-content";
import TaskCardLabels from "../kanban-board/task-labels";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";

type BacklogTaskRowProps = {
  task: Task;
};

const BacklogTaskRowContent = memo(function BacklogTaskRowContent({
  task,
  isDragging,
}: BacklogTaskRowProps & { isDragging: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const boardId = useBoardStore((state) => state.board?.id);
  const boardSlug = useBoardStore((state) => state.board?.slug);
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
  const toggleSelection = useBacklogBulkSelectionStore(
    (state) => state.toggleSelection,
  );
  const isTaskSelected = useBacklogBulkSelectionStore((state) =>
    state.selectedTaskIds.has(task.id),
  );
  const isSelectMode = useBacklogBulkSelectionStore(
    (state) => state.isSelectMode,
  );
  const isTaskFocused = useBacklogBulkSelectionStore(
    (state) => state.focusedTaskId === task.id,
  );

  const handleClick = (e: React.MouseEvent) => {
    if (!boardId || !task) return;
    if (e.defaultPrevented) return;

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
            {isSelectMode && (
              <Checkbox
                aria-label={`Select ${task.title}`}
                checked={isTaskSelected}
              />
            )}
            {showPriority && (
              <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
                {getPriorityIcon(task.priority ?? "")}
              </div>
            )}
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
                  {/* Inline beside the title, matching the list row: a backlog
                      row has no second line to spend, and the badge already
                      reads as secondary. */}
                  {task.parentTask && organization?.id && boardSlug && (
                    <SubtaskOfBadge
                      boardId={task.boardId}
                      boardSlug={boardSlug}
                      organizationId={organization.id}
                      parent={task.parentTask}
                    />
                  )}
                </span>
                {showLabels && (
                  <div className="flex items-center gap-1">
                    <TaskCardLabels labels={task.labels} />
                  </div>
                )}
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

            <TaskResourceIndicators task={task} compact />
            <TodoProgressBadge description={task.description} />

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

export default function BacklogTaskRow({ task }: BacklogTaskRowProps) {
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
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...intentPrefetchHandlers(() =>
        prefetchTaskNavigation(queryClient, task.id),
      )}
    >
      <BacklogTaskRowContent isDragging={isDragging} task={task} />
    </div>
  );
}
