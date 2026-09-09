import { useQuery } from "@tanstack/react-query";
import getRepoContents from "@/fetchers/repo/get-repo-contents";

export default function useGetRepoContents({
  repoId,
  path = "",
  ref,
  enabled = true,
}: {
  repoId: string;
  path?: string;
  ref?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryFn: () => getRepoContents({ repoId, path, ref }),
    queryKey: ["repo-contents", repoId, path, ref],
    enabled: !!repoId && enabled,
    staleTime: 60_000,
  });
}
