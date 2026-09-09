import { useMutation, useQueryClient } from "@tanstack/react-query";
import reorderTasks from "@/fetchers/task/reorder-tasks";
import type { TaskOrderUpdate } from "@/lib/reorder-board-task";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";
import type { BoardWithTasks } from "@/types/board";

type ReorderVariables = {
  boardId: string;
  board: BoardWithTasks;
  tasks: TaskOrderUpdate[];
};

export function useReorderTasks() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ boardId, tasks }: ReorderVariables) =>
      reorderTasks(boardId, tasks),
    onMutate: async ({ boardId }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", boardId] });
      const previous = queryClient.getQueryData<BoardWithTasks>([
        "tasks",
        boardId,
      ]);
      return { previous };
    },
    onError: (_error, { boardId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", boardId], context.previous);
        useBoardStore.getState().setBoard(context.previous);
      }
      toast.error("The move could not be saved. Your task order was restored.");
    },
    onSuccess: (_, { boardId, board }) => {
      queryClient.setQueryData(["tasks", boardId], board);
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
  return mutation;
}
