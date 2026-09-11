import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoPullRequestCommits } from "@/types/repo";

export default async function getPullRequestCommits(
  repoId: string,
  number: number,
) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/pull-requests/${number}/commits`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as RepoPullRequestCommits;
}
