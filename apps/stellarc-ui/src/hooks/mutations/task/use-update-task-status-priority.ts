import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskPriority from "@/fetchers/task/update-task-priority";
import type Task from "@/types/task";

export function useUpdateTaskPriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTaskPriority(task.id, task),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.boardId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["boards"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
      // Subtask and relation rows embed the related task, so they hold their
      // own copy of the priority. Without this they keep showing the old value
      // until something else refetches them — the status mutation already does
      // this for the same reason.
      queryClient.invalidateQueries({
        queryKey: ["task-relations"],
      });
    },
  });
}
