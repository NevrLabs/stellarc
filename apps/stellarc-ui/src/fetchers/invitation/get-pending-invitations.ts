import { client } from "@kaneo/libs";
import type { OrganizationMemberInvitation } from "@/types/organization-member";

export async function getPendingInvitations(): Promise<
  OrganizationMemberInvitation[]
> {
  const response = await client.invitation.pending.$get();

  if (!response.ok) {
    throw new Error("Failed to get pending invitations");
  }

  return response.json();
}
