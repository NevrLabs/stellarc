import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  RepoPullRequestStateFilter,
  RepoPullRequestsResponse,
} from "@/types/repo";

export type GetRepoPullRequestsRequest = {
  repoId: string;
  state?: RepoPullRequestStateFilter;
  page?: number;
  limit?: number;
};

async function getRepoPullRequests({
  repoId,
  state = "open",
  page = 1,
  limit = 50,
}: GetRepoPullRequestsRequest) {
  const searchParams = new URLSearchParams({
    state,
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(
    getApiUrl(`/repo/${repoId}/pull-requests?${searchParams.toString()}`),
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as RepoPullRequestsResponse;
}

export default getRepoPullRequests;
