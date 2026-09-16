import { useQuery } from "@tanstack/react-query";
import { identityGet, orgPath } from "@/lib/identity-client";
import type {
  InvitationPublic,
  MemberPublic,
  OrganizationPublic,
  TeamPublic,
} from "@/lib/identity-collections";

type GetFullOrganizationRequest = {
  organizationId?: string;
  organizationSlug?: string;
  membersLimit?: number;
};

export type FullOrganization = {
  organization: OrganizationPublic;
  members: MemberPublic[];
  teams: TeamPublic[];
  invitations: InvitationPublic[];
};

function useGetFullOrganization({
  organizationId,
  organizationSlug,
}: GetFullOrganizationRequest) {
  return useQuery({
    queryKey: ["organization", "full", organizationId || organizationSlug],
    enabled: !!(organizationId || organizationSlug),
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("useGetFullOrganization requires organizationId");
      }
      const [org, members, teams, invitations] = await Promise.all([
        identityGet<OrganizationPublic>(orgPath(organizationId)),
        identityGet<{ members: MemberPublic[] }>(
          orgPath(organizationId, "members"),
        ),
        identityGet<{ teams: TeamPublic[] }>(orgPath(organizationId, "teams")),
        identityGet<{ invitations: InvitationPublic[] }>(
          orgPath(organizationId, "invitations"),
        ).catch(() => ({ invitations: [] as InvitationPublic[] })),
      ]);
      return {
        organization: org,
        members: members.members,
        teams: teams.teams,
        invitations: invitations.invitations,
      } satisfies FullOrganization;
    },
  });
}

export default useGetFullOrganization;
