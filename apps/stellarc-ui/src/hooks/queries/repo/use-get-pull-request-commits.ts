import { useQuery } from "@tanstack/react-query";
import getPullRequestCommits from "@/fetchers/repo/get-pull-request-commits";

export default function useGetPullRequestCommits(
  repoId: string,
  number: number,
) {
  return useQuery({
    queryKey: ["repo-pull-request-commits", repoId, number],
    queryFn: () => getPullRequestCommits(repoId, number),
    enabled: Boolean(repoId) && Number.isFinite(number),
  });
}
