import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateMilestoneRequest } from "@/fetchers/milestone/update-milestone";
import updateMilestone from "@/fetchers/milestone/update-milestone";

function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateMilestone,
    onSuccess: (_updated, variables: UpdateMilestoneRequest) => {
      void queryClient.invalidateQueries({
        queryKey: ["milestones", variables.boardId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["milestone", variables.boardId, variables.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export default useUpdateMilestone;
