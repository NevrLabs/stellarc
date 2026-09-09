import { useMutation, useQueryClient } from "@tanstack/react-query";
import assign from "@/fetchers/project/assign-project-ticket-milestone";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";
export default function useAssignProjectTicketMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assign,
    onSuccess: (_d, v) => {
      invalidateProjectQueries(qc, v.projectId);
    },
  });
}
