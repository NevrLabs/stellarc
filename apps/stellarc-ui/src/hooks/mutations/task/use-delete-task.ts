import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTask from "@/fetchers/task/delete-task";

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", data.boardId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}
