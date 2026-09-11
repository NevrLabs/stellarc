import { useQuery } from "@tanstack/react-query";
import getPullRequestReviews from "@/fetchers/repo/get-pull-request-reviews";

export default function useGetPullRequestReviews(
  repoId: string,
  number: number,
) {
  return useQuery({
    queryKey: ["repo-pull-request-reviews", repoId, number],
    queryFn: () => getPullRequestReviews(repoId, number),
    enabled: Boolean(repoId) && Number.isFinite(number),
  });
}
