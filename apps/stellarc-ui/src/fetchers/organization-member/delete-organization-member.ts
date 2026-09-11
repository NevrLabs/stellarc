import { authClient } from "@/lib/auth-client";

export type DeleteOrganizationMemberRequest = {
  organizationId: string;
  userId: string;
};

async function deleteOrganizationMember({
  organizationId,
  userId,
}: DeleteOrganizationMemberRequest) {
  const { data, error } = await authClient.organization.removeMember({
    organizationId: organizationId,
    memberIdOrEmail: userId,
  });

  if (error) {
    throw new Error(error.message || "Failed to remove organization member");
  }

  return data;
}

export default deleteOrganizationMember;
