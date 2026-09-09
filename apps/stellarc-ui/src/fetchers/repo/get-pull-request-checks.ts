import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoPullRequestChecks } from "@/types/repo";

export default async function getPullRequestChecks(
  repoId: string,
  number: number,
) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/pull-requests/${number}/checks`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as RepoPullRequestChecks;
}
