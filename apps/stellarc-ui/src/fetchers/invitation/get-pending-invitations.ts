import { identityGet } from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";

export type OrganizationMemberInvitation = InvitationPublic;

export async function getPendingInvitations(): Promise<
  OrganizationMemberInvitation[]
> {
  // The authenticated user's pending invitations arrive through their orgs'
  // invitation lists; the API filters to the caller's email (invitation:read
  // + membership semantics). Read the dedicated lightweight endpoint when the
  // user has no org context yet — it returns [] rather than erroring.
  try {
    const invitations = await identityGet<OrganizationMemberInvitation[]>(
      "/invitations/pending",
    );
    return invitations;
  } catch {
    return [];
  }
}
