import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";
import { tasksQueryOptions } from "@/lib/navigation-prefetch";
import { reconcileTaskDetails } from "@/lib/reconcile-task-details";
import type { BoardWithTasks } from "@/types/board";

export function useGetTasks(boardId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    ...tasksQueryOptions(boardId),
    queryFn: async () => {
      const previous = queryClient.getQueryData<BoardWithTasks>([
        "tasks",
        boardId,
      ]);
      const current = await getTasks(boardId);
      reconcileTaskDetails(queryClient, previous, current);
      return current;
    },
    enabled: !!boardId,
    // Board switches render the previous board's rows until the new ones land,
    // instead of flashing the empty state. `isPlaceholderData` tells the view
    // it's showing stale rows so it can dim them.
    placeholderData: keepPreviousData,
    // A board's task list rarely changes between two clicks; serving it from
    // cache makes revisiting a board instant while the refetch happens behind.
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
}
