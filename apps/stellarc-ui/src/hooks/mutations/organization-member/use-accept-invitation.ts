import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type AcceptInvitationRequest = {
  invitationId: string;
};

function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId }: AcceptInvitationRequest) => {
      const { data, error } = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to accept invitation");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-invites"] });
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
      queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });
}

export default useAcceptInvitation;
