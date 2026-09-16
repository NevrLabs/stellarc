import { useMutation } from "@tanstack/react-query";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";
import queryClient from "@/query-client";

type CancelInvitationRequest = {
  invitationId: string;
  organizationId: string;
};

function useCancelInvitation() {
  return useMutation({
    mutationFn: async ({
      invitationId,
      organizationId,
    }: CancelInvitationRequest) => {
      const result = await identitySend<IdentityMutation<InvitationPublic>>(
        orgPath(organizationId, "invitations", invitationId, "cancel"),
        "POST",
        {},
      );
      return result.data;
    },
    onSuccess: (_, { organizationId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["organization-invites", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["organization", "full", organizationId],
      });
    },
  });
}

export default useCancelInvitation;
