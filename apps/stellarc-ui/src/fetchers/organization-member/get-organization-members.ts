import {
  type IdentityMutation,
  identityGet,
  orgPath,
} from "@/lib/identity-client";
import type { MemberPublic } from "@/lib/identity-collections";

export type GetOrganizationMembersRequest = {
  organizationId: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
};

async function getOrganizationMembers({
  organizationId,
}: GetOrganizationMembersRequest) {
  const { members } = await identityGet<{
    members: MemberPublic[];
  }>(orgPath(organizationId, "members"));
  return members;
}

export default getOrganizationMembers;
