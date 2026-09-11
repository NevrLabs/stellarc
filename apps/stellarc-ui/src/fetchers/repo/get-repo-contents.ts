import { getApiUrl } from "@/fetchers/get-api-url";
import type { RepoContents } from "@/types/repo";

export default async function getRepoContents({
  repoId,
  path = "",
  ref,
}: {
  repoId: string;
  path?: string;
  ref?: string;
}): Promise<RepoContents> {
  const searchParams = new URLSearchParams({ path });
  if (ref) searchParams.set("ref", ref);

  const response = await fetch(
    getApiUrl(`/repo/${repoId}/contents?${searchParams.toString()}`),
    { credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Failed to load repository contents",
    );
  }

  return (await response.json()) as RepoContents;
}
