import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoPullRequest } from "@/types/repo";

async function getRepoPullRequest(repoId: string, number: number) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/pull-requests/${number}`),
    { credentials: "include" },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as RepoPullRequest;
}

export default getRepoPullRequest;
