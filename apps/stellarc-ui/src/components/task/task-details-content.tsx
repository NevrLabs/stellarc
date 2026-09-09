import { useNavigate } from "@tanstack/react-router";
import { Archive, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import Activity, { type ActivityItem } from "@/components/activity";
import CommentInput from "@/components/activity/comment-input";
import { compactActivities } from "@/components/activity/compact-activities";
import { isCommentActivity } from "@/components/activity/utils";
import { ErrorBoundary } from "@/components/error-boundary";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Timeline } from "@/components/ui/timeline";
import useGetActivitiesByTaskId from "@/hooks/queries/activity/use-get-activities-by-task-id";
import useGetTask from "@/hooks/queries/task/use-get-task";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { formatArchivedSubtext } from "@/lib/archive-display";
import TaskDescription from "./task-description";
import TaskDescriptionHistory from "./task-description-history";
import TaskRelations from "./task-relations";
import TaskResources from "./task-resources";
import TaskSubtasks from "./task-subtasks";
import TaskTitle from "./task-title";

type TaskDetailsContentProps = {
  taskId: string | undefined;
  boardId: string;
  organizationId: string;
  className?: string;
};

export default function TaskDetailsContent({
  taskId,
  boardId,
  organizationId,
  className,
}: TaskDetailsContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: task } = useGetTask(taskId ?? "");
  const { data: activities = [] } = useGetActivitiesByTaskId(taskId ?? "");
  // #116: fold consecutive same-user status changes for display only.
  const activityGroups = useMemo(
    () => compactActivities<ActivityItem>(activities as ActivityItem[]),
    [activities],
  );
  const { data: relations = [] } = useGetTaskRelations(taskId ?? "");
  const { user } = useAuth();

  const parentRelation = relations.find(
    (rel: { relationType: string; targetTaskId: string }) =>
      rel.relationType === "subtask" && rel.targetTaskId === taskId,
  );
  const parentTask = parentRelation?.sourceTask;

  if (!taskId) return null;

  return (
    <div className={`${className} gap-4`}>
      <div className="flex flex-col gap-2.5">
        {parentTask && (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
                params: {
                  organizationSlug: organizationId,
                  boardSlug: boardId,
                  taskId: parentTask.id,
                },
              })
            }
          >
            <ArrowUpRight className="size-3" />
            <span>
              {t("tasks:detail.subtaskOf")}{" "}
              <span className="font-medium">{parentTask.title}</span>
            </span>
          </button>
        )}
        {task?.archivedAt && (
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground w-fit"
            data-testid="archived-subtext"
          >
            <Archive className="size-3" />
            <span>
              {formatArchivedSubtext(task.archivedAt, task.archivedByName)}
            </span>
          </div>
        )}
        {/*
          #258 follow-up: the task identifier used to be repeated here, directly
          above the title. Both hosts of this component already render it in
          their header — the drawer topbar and TaskLayout's breadcrumb — so it
          appeared twice on screen. The header is the single source.
        */}
        <TaskTitle taskId={taskId} />
        <TaskDescription taskId={taskId} />
        <TaskDescriptionHistory taskId={taskId} />
      </div>
      <div className="mt-4">
        <TaskSubtasks
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
        />
      </div>
      <div className="mt-2">
        <TaskRelations
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
        />
      </div>
      <div className="mt-2">
        <ErrorBoundary
          fallbackDescription="Linked GitHub issues and pull requests could not be rendered."
          fallbackTitle="Resources unavailable"
        >
          <TaskResources
            description={task?.description}
            organizationId={organizationId}
            taskId={taskId}
          />
        </ErrorBoundary>
      </div>
      <span className="text-sm font-medium text-muted-foreground h-[1px] bg-border w-full block shrink-0" />
      <div className="flex flex-col gap-4">
        <h1 className="text-md font-semibold">{t("tasks:detail.activity")}</h1>
        {user?.id && taskId && <CommentInput taskId={taskId} />}
        {activities.length > 0 ? (
          <Timeline>
            {/*
              #116: consecutive same-user status changes inside a minute render
              as ONE entry showing the net delta, expandable to the individual
              steps. Nothing is dropped — the folded entries live on the group.
            */}
            {activityGroups.map((group, index) => {
              const nextGroup = activityGroups[index + 1];
              const showConnector =
                !isCommentActivity(group.head) &&
                Boolean(nextGroup) &&
                !isCommentActivity(nextGroup.head);

              return (
                <Activity
                  key={group.head.id}
                  activity={group.head}
                  step={activityGroups.length - index}
                  showConnector={showConnector}
                  group={group}
                />
              );
            })}
          </Timeline>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            {t("tasks:detail.noActivity")}
          </p>
        )}
      </div>
    </div>
  );
}
