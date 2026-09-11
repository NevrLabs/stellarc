import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoGithubMetadata } from "@/types/repo";

export default async function getRepoGithubMetadata(
  repoId: string,
): Promise<RepoGithubMetadata> {
  const response = await fetch(getApiUrl(`/repo/${repoId}/github-metadata`), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Failed to load GitHub metadata",
    );
  }

  return (await response.json()) as RepoGithubMetadata;
}
