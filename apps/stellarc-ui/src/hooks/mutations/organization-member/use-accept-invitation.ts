import { useMutation } from "@tanstack/react-query";
import { type IdentityMutation, identitySend } from "@/lib/identity-client";
import type { MemberPublic } from "@/lib/identity-collections";
import queryClient from "@/query-client";

type AcceptInvitationRequest = {
  invitationId: string;
};

function useAcceptInvitation() {
  return useMutation({
    mutationFn: async ({ invitationId }: AcceptInvitationRequest) => {
      const result = await identitySend<IdentityMutation<MemberPublic>>(
        `/invitations/${encodeURIComponent(invitationId)}/accept`,
        "POST",
        {},
      );
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });
}

export default useAcceptInvitation;
