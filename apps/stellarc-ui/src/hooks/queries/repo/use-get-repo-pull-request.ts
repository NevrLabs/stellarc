import { useQuery } from "@tanstack/react-query";
import getRepoPullRequest from "@/fetchers/repo/get-repo-pull-request";

function useGetRepoPullRequest({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  return useQuery({
    queryFn: () => getRepoPullRequest(repoId, number),
    queryKey: ["repo-pull-request", repoId, number],
    enabled: !!repoId && Number.isFinite(number),
  });
}

export default useGetRepoPullRequest;
