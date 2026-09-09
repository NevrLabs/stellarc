import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateBoard from "@/fetchers/board/update-board";

function useUpdateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBoard,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", data.id] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}

export default useUpdateBoard;
