import type { QueryClient } from "@tanstack/react-query";
import getBoard from "@/fetchers/board/get-board";
import getRepo from "@/fetchers/repo/get-repo";
import getRepoIssues from "@/fetchers/repo/get-repo-issues";
import getRepoPullRequests from "@/fetchers/repo/get-repo-pull-requests";
import getTask from "@/fetchers/task/get-task";
import getTasks from "@/fetchers/task/get-tasks";

/**
 * How long a navigation-prefetched entry is served without a refetch.
 *
 * Prefetching is only useful if the destination's `useQuery` accepts the cached
 * entry: with the default `staleTime: 0` React Query refetches on mount, so the
 * route still paints a spinner and the prefetch bought nothing. These windows
 * are short enough that data stays fresh (the board list also polls every 30s)
 * and long enough to cover hover -> click -> mount.
 */
export const NAVIGATION_STALE_TIME = 10_000;
export const REPO_LIST_STALE_TIME = 30_000;

export const intentPrefetchHandlers = (prefetch: () => unknown) => ({
  onFocus: () => void prefetch(),
  onMouseEnter: () => void prefetch(),
  onPointerEnter: () => void prefetch(),
});

export const boardQueryOptions = (organizationId: string, boardId: string) => ({
  queryKey: ["boards", organizationId, boardId] as const,
  queryFn: () => getBoard({ id: boardId, organizationId }),
  staleTime: NAVIGATION_STALE_TIME,
});

export const tasksQueryOptions = (boardId: string) => ({
  queryKey: ["tasks", boardId] as const,
  queryFn: () => getTasks(boardId),
  staleTime: NAVIGATION_STALE_TIME,
});

export const taskQueryOptions = (taskId: string) => ({
  queryKey: ["task", taskId] as const,
  queryFn: () => getTask(taskId),
  staleTime: NAVIGATION_STALE_TIME,
});

export const repoQueryOptions = (repoId: string) => ({
  queryKey: ["repo", repoId] as const,
  queryFn: () => getRepo(repoId),
  staleTime: NAVIGATION_STALE_TIME,
});

export const repoIssuesQueryOptions = (
  repoId: string,
  state: "open" | "closed" | "all" = "open",
  page = 1,
  limit?: number,
) => ({
  queryKey: ["repo-issues", repoId, state, page, limit] as const,
  queryFn: () => getRepoIssues({ repoId, state, page, limit }),
  staleTime: REPO_LIST_STALE_TIME,
});

export const repoPullRequestsQueryOptions = (
  repoId: string,
  state: "open" | "closed" | "all" = "open",
  page = 1,
  limit?: number,
) => ({
  queryKey: ["repo-pull-requests", repoId, state, page, limit] as const,
  queryFn: () => getRepoPullRequests({ repoId, state, page, limit }),
  staleTime: REPO_LIST_STALE_TIME,
});

export function prefetchBoardNavigation(
  queryClient: QueryClient,
  organizationId: string,
  boardId: string,
) {
  return Promise.all([
    queryClient.prefetchQuery(boardQueryOptions(organizationId, boardId)),
    queryClient.prefetchQuery(tasksQueryOptions(boardId)),
  ]);
}

/**
 * Warm a single task before the row is clicked.
 *
 * The task route reads `["task", taskId]`; prefetching on row hover means the
 * detail view paints from cache instead of mounting into a loading state.
 */
export function prefetchTaskNavigation(
  queryClient: QueryClient,
  taskId: string,
) {
  return queryClient.prefetchQuery(taskQueryOptions(taskId));
}

/**
 * Warm everything the repository route renders above the fold.
 *
 * The repo page shows the issue list and the pull-request list, and both are
 * separate round trips to the forge, so hovering the sidebar link is the only
 * chance to overlap them with the user's decision time. Defaults must match the
 * consumers' (`state: "open"`, `page: 1`) or the keys miss.
 */
export function prefetchRepoNavigation(
  queryClient: QueryClient,
  repoId: string,
) {
  return Promise.all([
    queryClient.prefetchQuery(repoQueryOptions(repoId)),
    queryClient.prefetchQuery(repoIssuesQueryOptions(repoId, "open", 1, 50)),
    // The pull-request list is the other half of the repo page. It was declared
    // in the doc comment above but never actually prefetched, so hovering a repo
    // link warmed only the issues tab.
    queryClient.prefetchQuery(
      repoPullRequestsQueryOptions(repoId, "open", 1, 50),
    ),
  ]);
}
