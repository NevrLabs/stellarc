import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteProjectUpdate from "@/fetchers/project/delete-project-update";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";
export default function useDeleteProjectUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProjectUpdate,
    onSuccess: (_, vars) => invalidateProjectQueries(qc, vars.id),
  });
}
