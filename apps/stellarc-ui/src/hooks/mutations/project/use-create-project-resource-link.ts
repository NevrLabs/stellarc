import { useMutation, useQueryClient } from "@tanstack/react-query";
import createProjectResourceLink from "@/fetchers/project/create-project-resource-link";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useCreateProjectResourceLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProjectResourceLink,
    onSuccess: () => {
      invalidateProjectQueries(queryClient, projectId);
      queryClient.invalidateQueries({
        queryKey: ["project-resources", projectId],
      });
    },
  });
}

export default useCreateProjectResourceLink;
