import { useMutation, useQueryClient } from "@tanstack/react-query";
import unarchiveProject from "@/fetchers/project/unarchive-project";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useUnarchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unarchiveProject,
    onSuccess: (data) => {
      invalidateProjectQueries(queryClient, data.id);
    },
  });
}

export default useUnarchiveProject;
