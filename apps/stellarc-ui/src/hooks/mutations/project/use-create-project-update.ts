import { useMutation, useQueryClient } from "@tanstack/react-query";
import createProjectUpdate from "@/fetchers/project/create-project-update";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";
export default function useCreateProjectUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectUpdate,
    onSuccess: (_, vars) => invalidateProjectQueries(qc, vars.id),
  });
}
