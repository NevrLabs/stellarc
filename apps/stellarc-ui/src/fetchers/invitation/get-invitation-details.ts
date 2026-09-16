import { identityGet } from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";

export type InvitationDetails = {
  id: string;
  email: string;
  organizationName: string;
  inviterName: string;
  expiresAt: string;
  status: string;
  expired: boolean;
};

export type GetInvitationDetailsResponse = {
  valid: boolean;
  invitation?: InvitationDetails;
  error?: string;
};

export async function getInvitationDetails(
  invitationId: string,
): Promise<GetInvitationDetailsResponse> {
  try {
    return await identityGet<GetInvitationDetailsResponse>(
      `/invitations/${encodeURIComponent(invitationId)}/details`,
    );
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid invitation",
    };
  }
}
