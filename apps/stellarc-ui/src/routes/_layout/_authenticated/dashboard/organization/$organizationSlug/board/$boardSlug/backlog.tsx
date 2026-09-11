import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BacklogListView from "@/components/backlog-list-view";
import BoardToolbar from "@/components/board/board-toolbar";
import BoardLayout from "@/components/common/board-layout";
import SortControl from "@/components/common/sort-control";
import PageTitle from "@/components/page-title";
import CreateTaskAction from "@/components/task/create-task-action";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
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
import { shortcuts } from "@/constants/shortcuts";
import { useBulkOperations } from "@/hooks/mutations/task/use-bulk-operations";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useTaskFiltersWithLabelsSupport } from "@/hooks/use-task-filters-with-labels-support";
import type { SortConfig } from "@/lib/sort-tasks";
import { sortTasks } from "@/lib/sort-tasks";
import { toast } from "@/lib/toast";
import useBacklogBulkSelectionStore from "@/store/backlog-bulk-selection";
import useBoardStore from "@/store/board";
import { useUserPreferencesStore } from "@/store/user-preferences";

type BacklogSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/backlog",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): BacklogSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId, organizationSlug } = useBoardSlug();
  const { boardSlug } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useGetTasks(boardId);
  const { board, setBoard } = useBoardStore();

  // #143: proper confirmation dialog for the bulk move (was window.confirm).
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMovePending, setBulkMovePending] = useState(false);
  const { bulkMoveToBoard } = useBulkOperations();
  const { selectedTaskIds, isSelectMode, setSelectMode, clearSelection } =
    useBacklogBulkSelectionStore();
  const [sort, setSort] = useState<SortConfig>({
    field: "position",
    direction: "asc",
  });

  const { data: users } = useGetActiveOrganizationMembers(organizationId);
  const { data: organizationLabels = [] } =
    useGetLabelsByOrganization(organizationId);

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: {},
      replace: true,
    });
  }, [navigate]);

  const { setViewMode } = useUserPreferencesStore();

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.view.prefix]: {
        [shortcuts.view.board]: () => {
          setViewMode("board");
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board",
            params: {
              organizationSlug: organizationSlug,
              boardSlug: boardSlug,
            },
          });
        },
        [shortcuts.view.list]: () => {
          setViewMode("list");
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board",
            params: {
              organizationSlug: organizationSlug,
              boardSlug: boardSlug,
            },
          });
        },
        [shortcuts.view.gantt]: () => {
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/gantt",
            params: {
              organizationSlug: organizationSlug,
              boardSlug: boardSlug,
            },
          });
        },
        [shortcuts.view.backlog]: () => {},
      },
    },
  });

  useEffect(() => {
    if (data) setBoard(data);
  }, [data, setBoard]);

  const {
    filters,
    filteredBoard,
    updateFilter,
    updateLabelFilter,
    clearFilters,
    hasActiveFilters,
  } = useTaskFiltersWithLabelsSupport(board, boardId);

  const sortedBoard = useMemo(() => {
    if (!filteredBoard || sort.field === "position") return filteredBoard;
    return {
      ...filteredBoard,
      plannedTasks: sortTasks(filteredBoard.plannedTasks || [], sort),
      archivedTasks: sortTasks(filteredBoard.archivedTasks || [], sort),
    };
  }, [filteredBoard, sort]);

  /**
   * #143: open the confirmation dialog.
   *
   * This used to call the browser's native `confirm()`, which is an OS-level
   * box that ignores the app's styling, cannot show the destination, and is
   * not keyboard-navigable in the way the rest of the app is.
   */
  const selectedTasks = [
    ...(board?.plannedTasks ?? []),
    ...(board?.archivedTasks ?? []),
  ].filter((task) => selectedTaskIds.has(task.id));
  const todoColumn =
    board?.columns?.find(
      (column) => column.slug === "to-do" || column.name === "To Do",
    ) ?? board?.columns?.find((column) => !column.isFinal);

  const confirmBulkMove = async () => {
    if (bulkMovePending) return;
    setBulkMovePending(true);
    try {
      if (!todoColumn) throw new Error("No destination column");
      await bulkMoveToBoard({
        taskIds: selectedTasks.map((task) => task.id),
        status: todoColumn.id,
      });
      setBulkMoveOpen(false);
      clearSelection();
      toast.success(
        t("tasks:backlog.moveAllSuccess", { count: selectedTasks.length }),
      );
    } catch {
      toast.error(t("tasks:bulk.moveToBoardError"));
    } finally {
      setBulkMovePending(false);
    }
  };

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="backlog"
    >
      <PageTitle title={t("tasks:backlog.pageTitle", { name: board?.name })} />
      <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
        <div className="border-border/80 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="flex min-h-12 items-center px-3 py-2 md:px-4">
            <div className="flex w-full items-center gap-2">
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    isSelectMode
                      ? selectedTaskIds.size > 0 && setBulkMoveOpen(true)
                      : setSelectMode(true)
                  }
                  className="h-6 px-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  disabled={
                    (isSelectMode && selectedTaskIds.size === 0) || !todoColumn
                  }
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  {isSelectMode
                    ? `Move (${selectedTaskIds.size})`
                    : "Bulk Move"}
                </Button>

                <SortControl sort={sort} onSortChange={setSort} />
                <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                  <BoardToolbar
                    board={board}
                    filters={filters}
                    updateFilter={updateFilter}
                    updateLabelFilter={updateLabelFilter}
                    clearFilters={clearFilters}
                    hasActiveFilters={hasActiveFilters}
                    users={users}
                    organizationLabels={organizationLabels}
                    viewMode="board"
                    setViewMode={() => {}}
                    sort={sort}
                    onSortChange={setSort}
                    searchQuery=""
                    onSearchQueryChange={() => {}}
                    groupBy="none"
                    onGroupByChange={() => {}}
                    filtersOnly
                  />
                </div>
                <div className="ml-auto shrink-0">
                  <CreateTaskAction boardId={boardId} status="planned" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-card h-full">
          {sortedBoard ? (
            <BacklogListView
              board={sortedBoard}
              disableDragDrop={sort.field !== "position"}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-muted rounded-lg animate-pulse mx-auto" />
                <div className="space-y-2">
                  <div className="w-48 h-4 bg-muted rounded animate-pulse mx-auto" />
                  <div className="w-64 h-3 bg-muted rounded animate-pulse mx-auto" />
                </div>
              </div>
            </div>
          )}
        </div>

        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={handleCloseTaskSheet}
        />

        {/*
          #143: a real confirmation dialog for the bulk move. It names the
          exact number of tickets and the destination, the confirm button says
          what it does, and Escape/overlay-click cancel — all of which the
          native confirm() it replaced could not do.
        */}
        <AlertDialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
          <AlertDialogContent data-testid="backlog-move-all-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Move selected tickets?</AlertDialogTitle>
              <AlertDialogDescription>
                This will move {selectedTasks.length} tickets to{" "}
                {todoColumn?.name}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {selectedTasks.map((task) => (
                <li className="truncate" key={task.id}>
                  <span className="mr-2 font-mono text-muted-foreground">
                    {board?.slug}-{task.number}
                  </span>
                  {task.title}
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" size="sm" />}>
                {t("common:actions.cancel")}
              </AlertDialogClose>
              <Button
                data-testid="backlog-move-all-confirm"
                disabled={bulkMovePending}
                onClick={() => void confirmBulkMove()}
                size="sm"
              >
                {t("tasks:backlog.moveAllDialogConfirm", {
                  count: selectedTasks.length,
                })}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </BoardLayout>
  );
}
