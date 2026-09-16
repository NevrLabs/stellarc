import { identityGet, orgPath } from "@/lib/identity-client";
import type { MemberPublic } from "@/lib/identity-collections";

export type GetActiveOrganizationMembersRequest = {
  organizationId: string;
};

async function getActiveOrganizationMembers({
  organizationId,
}: GetActiveOrganizationMembersRequest) {
  const { members } = await identityGet<{
    members: MemberPublic[];
  }>(orgPath(organizationId, "members"));
  return members;
}

export default getActiveOrganizationMembers;
