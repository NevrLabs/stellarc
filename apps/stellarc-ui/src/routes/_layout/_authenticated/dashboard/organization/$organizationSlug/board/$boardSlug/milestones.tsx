import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import MilestonesView from "@/components/board/milestones-view";
import BoardLayout from "@/components/common/board-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSlug } from "@/hooks/use-board-slug";

type MilestonesSearchParams = { taskId?: string };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/milestones",
)({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): MilestonesSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId, organizationSlug } = useBoardSlug();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: board } = useGetTasks(boardId);
  const { data: milestones = [], isLoading } = useGetMilestonesByBoard(boardId);
  const tasks = board
    ? [
        ...board.columns.flatMap((column) => column.tasks),
        ...(board.plannedTasks ?? []),
        ...(board.archivedTasks ?? []),
      ]
    : [];

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="milestones"
    >
      <PageTitle
        title={t("tasks:milestone.view.pageTitle", { name: board?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border/80 px-4 py-3">
          <h1 className="text-sm font-semibold">
            {t("tasks:milestone.view.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("tasks:milestone.view.description")}
          </p>
        </div>
        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground" role="status">
            {t("tasks:milestone.loading")}
          </div>
        ) : (
          <MilestonesView
            milestones={milestones}
            tasks={tasks}
            organizationId={organizationId}
            boardId={boardId}
          />
        )}
        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={() => navigate({ to: ".", search: {}, replace: true })}
        />
      </div>
    </BoardLayout>
  );
}
