import type { authClient } from "@/lib/auth-client";

export type OrganizationMember = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.listMembers>>["data"]
>[number];

// Active organization member (current user's membership)
export type ActiveOrganizationMember = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.getActiveMember>>["data"]
>;

// Organization invitation types
export type OrganizationMemberInvitation = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.listInvitations>>["data"]
>[number];

export type UserInvitation = NonNullable<
  Awaited<
    ReturnType<typeof authClient.organization.listUserInvitations>
  >["data"]
>[number];

export default OrganizationMember;
