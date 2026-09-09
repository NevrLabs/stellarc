import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type RejectInvitationRequest = {
  invitationId: string;
};

function useRejectInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId }: RejectInvitationRequest) => {
      const { data, error } = await authClient.organization.rejectInvitation({
        invitationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to reject invitation");
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

export default useRejectInvitation;
