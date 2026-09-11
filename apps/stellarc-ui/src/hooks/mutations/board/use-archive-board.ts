import { useMutation, useQueryClient } from "@tanstack/react-query";
import archiveBoard from "@/fetchers/board/archive-board";

function useArchiveBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveBoard,
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["boards"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["boards"] });
      queryClient.setQueriesData({ queryKey: ["boards"] }, (boards: unknown) =>
        Array.isArray(boards)
          ? boards.filter((board) => board.id !== id)
          : boards,
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? [])
        queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["boards"] }),
  });
}
export default useArchiveBoard;
