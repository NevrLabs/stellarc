import { useQuery } from "@tanstack/react-query";
import getRepoTree from "@/fetchers/repo/get-repo-tree";

export default function useGetRepoTree({
  repoId,
  ref,
}: {
  repoId: string;
  ref?: string;
}) {
  return useQuery({
    queryFn: () => getRepoTree({ repoId, ref }),
    queryKey: ["repo-tree", repoId, ref],
    enabled: !!repoId,
    staleTime: 60_000,
  });
}
