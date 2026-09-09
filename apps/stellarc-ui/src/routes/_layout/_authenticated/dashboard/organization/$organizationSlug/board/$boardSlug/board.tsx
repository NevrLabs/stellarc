import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardToolbar from "@/components/board/board-toolbar";
import BoardLayout from "@/components/common/board-layout";
import { BoardSkeleton } from "@/components/common/board-skeleton";
import KanbanBoard from "@/components/kanban-board";
import { BoardGroupByProvider } from "@/components/kanban-board/board-view-context";
import ListView from "@/components/list-view";
import ListBulkActionsToggle from "@/components/list-view/list-bulk-actions-toggle";
import {
  readListGroupBy,
  writeListGroupBy,
} from "@/components/list-view/list-grouping";
import ListNestHint from "@/components/list-view/list-nest-hint";
import PageTitle from "@/components/page-title";
import CreateTaskAction from "@/components/task/create-task-action";

import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { shortcuts } from "@/constants/shortcuts";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useBoardSort } from "@/hooks/use-board-sort";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  type BoardGroupBy,
  useTaskFiltersWithLabelsSupport,
} from "@/hooks/use-task-filters-with-labels-support";
import { sortTasks } from "@/lib/sort-tasks";
import useBoardStore from "@/store/board";
import { useUserPreferencesStore } from "@/store/user-preferences";

type BoardSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/board",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): BoardSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId, organizationSlug } = useBoardSlug();
  const { boardSlug } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  // isPlaceholderData is true while the incoming board's tasks are still in
  // flight and react-query is serving the previous board's data (keepPreviousData).
  // Showing the skeleton then means a board switch never displays the OLD
  // board's cards under the NEW board's name.
  const { data, isPlaceholderData } = useGetTasks(boardId);
  const { board, setBoard } = useBoardStore();
  const { viewMode, setViewMode } = useUserPreferencesStore();
  /*
    ONE grouping choice drives both Board and List. They used to keep separate
    state with different vocabularies, so switching view silently changed the
    grouping. Persisted per board, which the list-only state already did.
  */
  const [groupBy, setGroupByState] = useState<BoardGroupBy>(() =>
    readListGroupBy(boardId),
  );
  useEffect(() => {
    setGroupByState(readListGroupBy(boardId));
  }, [boardId]);
  const setGroupBy = useCallback(
    (value: BoardGroupBy) => {
      setGroupByState(value);
      writeListGroupBy(boardId, value);
    },
    [boardId],
  );

  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardSearchInput, setBoardSearchInput] =
    useState<HTMLInputElement | null>(null);
  const { sort, setSort } = useBoardSort(boardId);

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

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.view.prefix]: {
        [shortcuts.view.board]: () => setViewMode("board"),
        [shortcuts.view.list]: () => setViewMode("list"),
        [shortcuts.view.gantt]: () =>
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/gantt",
            params: {
              organizationSlug: organizationSlug,
              boardSlug: boardSlug,
            },
          }),
        [shortcuts.view.backlog]: () =>
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/backlog",
            params: {
              organizationSlug: organizationSlug,
              boardSlug: boardSlug,
            },
          }),
      },
    },
  });

  useEffect(() => {
    if (data) {
      setBoard(data);
    }
  }, [data, setBoard]);

  // The search box is always present in the toolbar now, so cmd/ctrl-F just
  // focuses it instead of mounting a transient popover in the page header.
  const focusBoardSearch = useCallback(() => {
    boardSearchInput?.focus();
  }, [boardSearchInput]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f";

      if (!isFindShortcut) return;

      event.preventDefault();
      focusBoardSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusBoardSearch]);

  const {
    filters,
    updateFilter,
    updateLabelFilter,
    filteredBoard,
    hasActiveFilters,
    clearFilters,
  } = useTaskFiltersWithLabelsSupport(board, boardId, boardSearchQuery);

  const sortedBoard = useMemo(() => {
    if (!filteredBoard || sort.field === "position") return filteredBoard;
    return {
      ...filteredBoard,
      columns: filteredBoard.columns.map((column) => ({
        ...column,
        tasks: sortTasks(column.tasks, sort),
      })),
    };
  }, [filteredBoard, sort]);

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="board"
    >
      <PageTitle
        title={`${board?.name} — ${viewMode === "board" ? t("tasks:view.board") : t("tasks:view.list")}`}
        hideAppName
      />
      {/* Keyed by board so the content fades in on every board switch. Without
          the key React reuses this subtree across boards, and `starting:`
          styles only apply on first mount — so switching boards swapped the
          cards in with no transition at all. */}
      <div
        key={boardId}
        className="relative flex flex-col h-full min-h-0 overflow-hidden transition-opacity duration-200 ease-out starting:opacity-0"
      >
        <BoardToolbar
          board={board}
          filters={filters}
          updateFilter={updateFilter}
          updateLabelFilter={updateLabelFilter}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          users={users}
          organizationLabels={organizationLabels}
          sort={sort}
          onSortChange={setSort}
          searchQuery={boardSearchQuery}
          onSearchQueryChange={setBoardSearchQuery}
          searchInputRef={setBoardSearchInput}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          // List-only affordances, hosted in the shared toolbar so List does
          // not need a second bar of its own.
          searchAdornment={viewMode === "list" ? <ListNestHint /> : undefined}
          secondaryActions={
            viewMode === "list" ? <ListBulkActionsToggle /> : undefined
          }
          actions={<CreateTaskAction boardId={boardId} />}
        />

        <div className="flex h-full flex-1 overflow-hidden bg-background">
          <div className="relative flex h-full min-w-0 flex-1 overflow-hidden">
            {sortedBoard && !isPlaceholderData ? (
              <BoardGroupByProvider groupBy={groupBy}>
                {viewMode === "board" ? (
                  <KanbanBoard
                    board={sortedBoard}
                    disableDragDrop={sort.field !== "position"}
                  />
                ) : (
                  <ListView
                    board={sortedBoard}
                    disableDragDrop={sort.field !== "position"}
                    listGroupBy={groupBy}
                  />
                )}
              </BoardGroupByProvider>
            ) : (
              <BoardSkeleton />
            )}
          </div>
        </div>

        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </BoardLayout>
  );
}
