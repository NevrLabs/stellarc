import { getApiUrl } from "@/fetchers/get-api-url";
import type { Repo } from "@/types/repo";

async function getRepos(organizationId: string, teamId?: string | null) {
  if (!organizationId) return [];

  const response = await fetch(
    getApiUrl(
      `/repo?organizationId=${encodeURIComponent(organizationId)}${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`,
    ),
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as Repo[];
}

export default getRepos;
