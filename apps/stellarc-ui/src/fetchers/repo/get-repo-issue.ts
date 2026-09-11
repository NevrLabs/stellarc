import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoIssue } from "@/types/repo";

async function getRepoIssue(repoId: string, number: number) {
  const response = await fetch(getApiUrl(`/repo/${repoId}/issues/${number}`), {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as RepoIssue;
}

export default getRepoIssue;
