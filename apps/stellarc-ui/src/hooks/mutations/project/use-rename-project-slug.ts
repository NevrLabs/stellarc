import { useMutation, useQueryClient } from "@tanstack/react-query";
import renameProjectSlug from "@/fetchers/project/rename-project-slug";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

function useRenameProjectSlug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: renameProjectSlug,
    onSuccess: (data) => {
      invalidateProjectQueries(queryClient, data.id);
    },
  });
}

export default useRenameProjectSlug;
