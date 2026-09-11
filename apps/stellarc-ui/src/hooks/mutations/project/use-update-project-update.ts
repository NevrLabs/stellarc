import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectUpdate from "@/fetchers/project/update-project-update";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";
export default function useUpdateProjectUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateProjectUpdate,
    onSuccess: (_, vars) => invalidateProjectQueries(qc, vars.id),
  });
}
