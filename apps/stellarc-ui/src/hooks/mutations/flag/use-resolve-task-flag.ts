import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ResolveTaskFlagRequest } from "@/fetchers/flag/resolve-task-flag";
import resolveTaskFlag from "@/fetchers/flag/resolve-task-flag";

function useResolveTaskFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resolveTaskFlag,
    onSuccess: (_resolved, variables: ResolveTaskFlagRequest) => {
      if (variables.taskId) {
        void queryClient.invalidateQueries({
          queryKey: ["task-flags", variables.taskId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["activities", variables.taskId],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["my-flags"] });
    },
  });
}

export default useResolveTaskFlag;
