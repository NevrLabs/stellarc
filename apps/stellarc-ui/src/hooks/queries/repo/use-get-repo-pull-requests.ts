import { useQuery } from "@tanstack/react-query";
import { repoPullRequestsQueryOptions } from "@/lib/navigation-prefetch";
import type { RepoPullRequestStateFilter } from "@/types/repo";

function useGetRepoPullRequests({
  repoId,
  state = "open",
  page = 1,
  limit = 50,
}: {
  repoId: string;
  state?: RepoPullRequestStateFilter;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    ...repoPullRequestsQueryOptions(repoId, state, page, limit),
    enabled: !!repoId,
  });
}

export default useGetRepoPullRequests;
