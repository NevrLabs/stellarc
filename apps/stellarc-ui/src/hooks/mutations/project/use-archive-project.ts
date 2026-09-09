import { useMutation, useQueryClient } from "@tanstack/react-query";
import archiveProject from "@/fetchers/project/archive-project";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveProject,
    onSuccess: (data) => {
      invalidateProjectQueries(queryClient, data.id);
    },
  });
}

export default useArchiveProject;
