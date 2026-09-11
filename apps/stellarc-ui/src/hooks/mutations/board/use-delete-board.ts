import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteBoard from "@/fetchers/board/delete-board";

function useDeleteBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBoard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}

export default useDeleteBoard;
