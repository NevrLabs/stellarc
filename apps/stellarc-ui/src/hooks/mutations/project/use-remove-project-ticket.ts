import { useMutation, useQueryClient } from "@tanstack/react-query";
import removeProjectTicket from "@/fetchers/project/remove-project-ticket";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useRemoveProjectTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeProjectTicket,
    onSuccess: (_data, variables) => {
      invalidateProjectQueries(queryClient, variables.id);
    },
  });
}

export default useRemoveProjectTicket;
