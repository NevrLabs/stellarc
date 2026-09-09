import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoPullRequestFiles } from "@/types/repo";

export default async function getPullRequestFiles(
  repoId: string,
  number: number,
) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/pull-requests/${number}/files`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as RepoPullRequestFiles;
}
