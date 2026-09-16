import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";

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
  const result = await identitySend<IdentityMutation<InvitationPublic>>(
    orgPath(organizationId, "invitations"),
    "POST",
    { email, role },
  );
  return result.data;
};

export default inviteOrganizationMember;
