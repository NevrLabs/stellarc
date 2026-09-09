import { useQuery } from "@tanstack/react-query";
import getRepoIssue from "@/fetchers/repo/get-repo-issue";

function useGetRepoIssue({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  return useQuery({
    queryFn: () => getRepoIssue(repoId, number),
    queryKey: ["repo-issue", repoId, number],
    enabled: !!repoId && Number.isFinite(number),
    // GitHub webhooks refresh the mirror server-side. Poll the live detail
    // endpoint as well so provider-side comments/events appear without a
    // browser refresh even when this client missed the webhook broadcast.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export default useGetRepoIssue;
