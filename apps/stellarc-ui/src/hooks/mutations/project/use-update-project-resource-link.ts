import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectResourceLink from "@/fetchers/project/update-project-resource-link";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useUpdateProjectResourceLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProjectResourceLink,
    onSuccess: () => {
      invalidateProjectQueries(queryClient, projectId);
      queryClient.invalidateQueries({
        queryKey: ["project-resources", projectId],
      });
    },
  });
}

export default useUpdateProjectResourceLink;
