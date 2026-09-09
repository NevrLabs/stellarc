import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteProjectResourceLink from "@/fetchers/project/delete-project-resource-link";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useDeleteProjectResourceLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProjectResourceLink,
    onSuccess: () => {
      invalidateProjectQueries(queryClient, projectId);
      queryClient.invalidateQueries({
        queryKey: ["project-resources", projectId],
      });
    },
  });
}

export default useDeleteProjectResourceLink;
