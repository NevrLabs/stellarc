import { getApiUrl } from "@/fetchers/get-api-url";

export type EffectiveTeamMember = {
  userId: string;
  /** null for direct members; sub-team that contributes an inherited member. */
  viaTeamId: string | null;
  viaTeamName: string | null;
};

export async function getEffectiveTeamMembers(
  teamId: string,
  organizationId: string,
): Promise<EffectiveTeamMember[]> {
  const response = await fetch(
    getApiUrl(
      `/team/${encodeURIComponent(teamId)}/effective-members?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as EffectiveTeamMember[];
}

export async function setTeamParent(
  teamId: string,
  organizationId: string,
  parentTeamId: string | null,
): Promise<{ id: string; parentTeamId: string | null }> {
  const response = await fetch(
    getApiUrl(`/team/${encodeURIComponent(teamId)}/parent`),
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, parentTeamId }),
    },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { id: string; parentTeamId: string | null };
}

export type TeamParentLink = { id: string; parentTeamId: string | null };

/**
 * Parent links for every team in the organization. Better Auth's client
 * strips additionalFields it does not know at parse time, so parentTeamId
 * never survives listTeams — this endpoint is the source of truth.
 */
export async function getTeamHierarchy(
  organizationId: string,
): Promise<TeamParentLink[]> {
  const response = await fetch(
    getApiUrl(
      `/team/hierarchy?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as TeamParentLink[];
}
