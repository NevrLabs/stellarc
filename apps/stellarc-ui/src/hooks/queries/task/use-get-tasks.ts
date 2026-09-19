import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import getTasks from "@/fetchers/task/get-tasks";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { tasksQueryOptions } from "@/lib/navigation-prefetch";
import { reconcileTaskDetails } from "@/lib/reconcile-task-details";
import { useBoardWithTasksLive } from "@/lib/work-live-store";
import type { BoardWithTasks } from "@/types/board";

/**
 * STL-16 §4/§6 (T28/T30/T32): the board/list/backlog views read LIVE
 * collections through the shape engine — REST stays as bootstrap/compat.
 * The hook's public shape ({data, isPlaceholderData}) is unchanged so the
 * frozen screens and their baselines stay byte-compatible.
 */
export function useGetTasks(boardId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();
  const { board } = useBoardWithTasksLive(
    organization?.id ?? "",
    boardId,
    user?.id,
  );
  // Live rows land in the react-query cache under the same ["tasks", boardId]
  // key so reconcileTaskDetails and every cache consumer keep working.
  useEffect(() => {
    if (!board) return;
    // Structural cast: the live view-model mirrors the fork BoardWithTasks
    // shape field-for-field (tests/unit/work-view-model.test.ts pins the map).
    queryClient.setQueryData<BoardWithTasks>(
      ["tasks", boardId],
      board as unknown as BoardWithTasks,
    );
  }, [board, boardId, queryClient]);
  return useQuery({
    ...tasksQueryOptions(boardId),
    queryFn: async () => {
      if (board) return board as unknown as BoardWithTasks;
      const previous = queryClient.getQueryData<BoardWithTasks>([
        "tasks",
        boardId,
      ]);
      const current = await getTasks(boardId);
      reconcileTaskDetails(queryClient, previous, current);
      return current;
    },
    enabled: !!boardId,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
}
