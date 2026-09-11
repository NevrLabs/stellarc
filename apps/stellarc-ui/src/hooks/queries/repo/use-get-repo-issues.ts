import { useQuery } from "@tanstack/react-query";
import { repoIssuesQueryOptions } from "@/lib/navigation-prefetch";
import type { RepoIssueStateFilter } from "@/types/repo";

function useGetRepoIssues({
  repoId,
  state = "open",
  page = 1,
  limit = 50,
}: {
  repoId: string;
  state?: RepoIssueStateFilter;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    ...repoIssuesQueryOptions(repoId, state, page, limit),
    enabled: !!repoId,
  });
}

export default useGetRepoIssues;
