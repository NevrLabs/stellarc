import { useQuery } from "@tanstack/react-query";
import getPullRequestChecks from "@/fetchers/repo/get-pull-request-checks";

export default function useGetPullRequestChecks(
  repoId: string,
  number: number,
) {
  return useQuery({
    queryKey: ["repo-pull-request-checks", repoId, number],
    queryFn: () => getPullRequestChecks(repoId, number),
    enabled: Boolean(repoId) && Number.isFinite(number),
  });
}
