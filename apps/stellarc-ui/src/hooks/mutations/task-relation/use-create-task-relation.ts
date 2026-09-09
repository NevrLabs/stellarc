import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTaskRelation from "@/fetchers/task-relation/create-task-relation";

function useCreateTaskRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskRelation,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.sourceTaskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.targetTaskId],
      });
      // The drawer reads ["task-relations", id], but the board/list views read
      // the subtask parent off the TASK rows (`task.parentTask`, produced by
      // getTasks) and the timeline reads ["board-task-relations"]. Invalidating
      // only the drawer's key left a freshly created sub-ticket showing in the
      // drawer while the card behind it kept the stale, un-nested shape.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["board-task-relations"] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });
}

export default useCreateTaskRelation;
