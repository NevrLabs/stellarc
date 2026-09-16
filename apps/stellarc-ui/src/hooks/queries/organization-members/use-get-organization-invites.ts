import { useQuery } from "@tanstack/react-query";
import { identityGet, orgPath } from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";

type GetOrganizationInvitesRequest = {
  organizationId?: string;
};

function useGetOrganizationInvites({
  organizationId,
}: GetOrganizationInvitesRequest) {
  return useQuery({
    queryKey: ["organization-invites", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { invitations } = await identityGet<{
        invitations: InvitationPublic[];
      }>(orgPath(organizationId!, "invitations"));
      return invitations;
    },
  });
}

export default useGetOrganizationInvites;
