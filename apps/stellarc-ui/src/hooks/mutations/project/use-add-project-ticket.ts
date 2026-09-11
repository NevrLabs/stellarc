import { useMutation, useQueryClient } from "@tanstack/react-query";
import addProjectTicket from "@/fetchers/project/add-project-ticket";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useAddProjectTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addProjectTicket,
    onSuccess: (data) => {
      invalidateProjectQueries(queryClient, data.id);
    },
  });
}

export default useAddProjectTicket;
