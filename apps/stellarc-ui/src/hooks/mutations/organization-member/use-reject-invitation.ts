import { useMutation } from "@tanstack/react-query";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";
import queryClient from "@/query-client";

type RejectInvitationRequest = {
  invitationId: string;
  organizationId: string;
};

// The identity API models rejection as a manager-side cancel (§3 has no
// invitee reject route); the frozen UI's reject button consumes the same
// envelope so its toast semantics stay intact.
function useRejectInvitation() {
  return useMutation({
    mutationFn: async ({
      invitationId,
      organizationId,
    }: RejectInvitationRequest) => {
      const result = await identitySend<IdentityMutation<InvitationPublic>>(
        orgPath(organizationId, "invitations", invitationId, "cancel"),
        "POST",
        {},
      );
      return result.data;
    },
    onSuccess: (_, { organizationId }) => {
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
      void queryClient.invalidateQueries({
        queryKey: ["organization-invites", organizationId],
      });
    },
  });
}

export default useRejectInvitation;
