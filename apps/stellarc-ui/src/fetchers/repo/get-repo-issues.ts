import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoIssueStateFilter, RepoIssuesResponse } from "@/types/repo";

export type GetRepoIssuesRequest = {
  repoId: string;
  state?: RepoIssueStateFilter;
  page?: number;
  limit?: number;
};

async function getRepoIssues({
  repoId,
  state = "open",
  page = 1,
  limit = 50,
}: GetRepoIssuesRequest) {
  const searchParams = new URLSearchParams({
    state,
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(
    getApiUrl(`/repo/${repoId}/issues?${searchParams.toString()}`),
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as RepoIssuesResponse;
}

export default getRepoIssues;
