import { useMutation, useQueryClient } from "@tanstack/react-query";
import reorderColumns from "@/fetchers/column/reorder-columns";

export function useReorderColumns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      columns,
    }: {
      boardId: string;
      columns: Array<{ id: string; position: number }>;
    }) => reorderColumns(boardId, columns),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ refetchType: "all" });
    },
  });
}
