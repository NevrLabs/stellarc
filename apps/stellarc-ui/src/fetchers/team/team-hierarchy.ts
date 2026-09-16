import {
  type IdentityMutation,
  identityGet,
  identitySend,
  orgPath,
} from "@/lib/identity-client";

export type EffectiveTeamMember = {
  userId: string;
  /** null for direct members; sub-team that contributes an inherited member. */
  viaTeamId: string | null;
  viaTeamName: string | null;
};

export type TeamNode = {
  id: string;
  name: string;
  organizationId: string;
  source: string;
  icon: string | null;
  parentTeamId: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export async function getEffectiveTeamMembers(
  teamId: string,
  organizationId: string,
): Promise<EffectiveTeamMember[]> {
  const { members } = await identityGet<{
    members: Array<{
      id: string;
      teamId: string;
      userId: string;
      organizationId: string;
      createdAt: string | null;
      name: string | null;
    }>;
  }>(orgPath(organizationId, "teams", teamId, "members"));
  return members.map((member) => ({
    userId: member.userId,
    viaTeamId: null,
    viaTeamName: null,
  }));
}

export async function setTeamParent(
  teamId: string,
  organizationId: string,
  parentTeamId: string | null,
): Promise<{ id: string; parentTeamId: string | null }> {
  const result = await identitySend<
    IdentityMutation<TeamNode & { members?: unknown[] }>
  >(orgPath(organizationId, "teams", teamId), "PATCH", {
    ...(parentTeamId ? { parentTeamId } : {}),
  });
  return { id: result.data.id, parentTeamId: result.data.parentTeamId ?? null };
}

export type TeamParentLink = { id: string; parentTeamId: string | null };

/** Parent links for every team in the organization (identity /teams list). */
export async function getTeamHierarchy(
  organizationId: string,
): Promise<TeamParentLink[]> {
  const { teams } = await identityGet<{ teams: TeamNode[] }>(
    orgPath(organizationId, "teams"),
  );
  return teams.map((team) => ({
    id: team.id,
    parentTeamId: team.parentTeamId,
  }));
}
