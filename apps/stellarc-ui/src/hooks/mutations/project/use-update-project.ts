import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProject from "@/fetchers/project/update-project";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProject,
    onSuccess: (data) => {
      invalidateProjectQueries(queryClient, data.id);
    },
  });
}

export default useUpdateProject;
