import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";

function useDeleteTaskRelation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskRelation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["task-relations", taskId],
      });
      // Unlinking has to clear the parent badge on the board/list card too —
      // those views read `task.parentTask` off the task rows, not this key.
      // Mirrors useCreateTaskRelation; see the note there.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["board-task-relations"] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });
}

export default useDeleteTaskRelation;
