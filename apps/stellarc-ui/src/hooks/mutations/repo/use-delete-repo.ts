import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteRepo from "@/fetchers/repo/delete-repo";

function useDeleteRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => deleteRepo(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export default useDeleteRepo;
