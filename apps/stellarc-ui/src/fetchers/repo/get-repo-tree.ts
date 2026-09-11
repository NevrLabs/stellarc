import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoTree } from "@/types/repo";

export default async function getRepoTree({
  repoId,
  ref,
}: {
  repoId: string;
  ref?: string;
}): Promise<RepoTree> {
  const searchParams = new URLSearchParams();
  if (ref) searchParams.set("ref", ref);
  const query = searchParams.size ? `?${searchParams.toString()}` : "";
  const response = await fetch(getApiUrl(`/repo/${repoId}/tree${query}`), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Failed to preload repository tree",
    );
  }

  return (await response.json()) as RepoTree;
}
