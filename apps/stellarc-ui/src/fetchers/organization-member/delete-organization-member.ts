import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";

export type DeleteOrganizationMemberRequest = {
  organizationId: string;
  /** The removed member's user id (fork UI passes the row's userId). */
  userId: string;
};

async function deleteOrganizationMember({
  organizationId,
  userId,
}: DeleteOrganizationMemberRequest) {
  const result = await identitySend<IdentityMutation<{ id: string }>>(
    orgPath(organizationId, "members", userId),
    "DELETE",
  );
  return result.data;
}

export default deleteOrganizationMember;
