import { useMutation, useQueryClient } from "@tanstack/react-query";
import createProject from "@/fetchers/project/create-project";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: (data) => {
      invalidateProjectQueries(queryClient, data.id);
    },
  });
}

export default useCreateProject;
