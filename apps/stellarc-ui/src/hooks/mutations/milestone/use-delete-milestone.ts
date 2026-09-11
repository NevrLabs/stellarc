import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeleteMilestoneRequest } from "@/fetchers/milestone/delete-milestone";
import deleteMilestone from "@/fetchers/milestone/delete-milestone";

function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMilestone,
    onSuccess: (_deleted, variables: DeleteMilestoneRequest) => {
      void queryClient.invalidateQueries({
        queryKey: ["milestones", variables.boardId],
      });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export default useDeleteMilestone;
