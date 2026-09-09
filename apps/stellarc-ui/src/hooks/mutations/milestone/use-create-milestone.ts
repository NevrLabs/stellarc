import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateMilestoneRequest } from "@/fetchers/milestone/create-milestone";
import createMilestone from "@/fetchers/milestone/create-milestone";

function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMilestone,
    onSuccess: (_created, variables: CreateMilestoneRequest) => {
      void queryClient.invalidateQueries({
        queryKey: ["milestones", variables.boardId],
      });
    },
  });
}

export default useCreateMilestone;
