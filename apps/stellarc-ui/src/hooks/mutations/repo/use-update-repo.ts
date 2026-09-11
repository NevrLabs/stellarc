import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateRepo from "@/fetchers/repo/update-repo";

function useUpdateRepo(_scope?: {
  organizationId?: string;
  teamId?: string | null;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateRepo,
    onSuccess: () =>
      // Prefix invalidation: a repo can be cached under several team scopes
      // (["repos", orgId, teamId] variants). The exact-key version silently
      // missed every sibling scope. Matches useDeleteRepo.
      queryClient.invalidateQueries({
        queryKey: ["repos"],
      }),
  });
}

export default useUpdateRepo;
