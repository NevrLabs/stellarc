import { authClient } from "@/lib/auth-client";

export type InviteOrganizationMemberRequest = {
  organizationId: string;
  email: string;
  role?: "owner" | "admin" | "member";
};

const inviteOrganizationMember = async ({
  organizationId,
  email,
  role = "member",
}: InviteOrganizationMemberRequest) => {
  const { data, error } = await authClient.organization.inviteMember({
    organizationId: organizationId,
    email,
    role,
  });

  if (error) {
    throw new Error(error.message || "Failed to invite organization member");
  }

  return data;
};

export default inviteOrganizationMember;
