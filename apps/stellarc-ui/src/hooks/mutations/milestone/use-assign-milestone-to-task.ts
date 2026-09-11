import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssignMilestoneToTaskRequest } from "@/fetchers/milestone/assign-milestone-to-task";
import assignMilestoneToTask from "@/fetchers/milestone/assign-milestone-to-task";

function useAssignMilestoneToTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: assignMilestoneToTask,
    onSuccess: (_task, variables: AssignMilestoneToTaskRequest) => {
      // The task row carries milestoneId, so both the task and any board task
      // list have to be refetched, plus the milestone list for progress counts.
      void queryClient.invalidateQueries({
        queryKey: ["task", variables.taskId],
      });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({
        queryKey: ["milestones", variables.boardId],
      });
    },
  });
}

export default useAssignMilestoneToTask;
