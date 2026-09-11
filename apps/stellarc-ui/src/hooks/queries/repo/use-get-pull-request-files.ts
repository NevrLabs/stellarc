import { useQuery } from "@tanstack/react-query";
import getPullRequestFiles from "@/fetchers/repo/get-pull-request-files";

export default function useGetPullRequestFiles(repoId: string, number: number) {
  return useQuery({
    queryKey: ["repo-pull-request-files", repoId, number],
    queryFn: () => getPullRequestFiles(repoId, number),
    enabled: Boolean(repoId) && Number.isFinite(number),
  });
}
