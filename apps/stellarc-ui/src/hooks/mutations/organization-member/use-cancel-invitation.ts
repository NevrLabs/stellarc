import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import queryClient from "@/query-client";

type CancelInvitationRequest = {
  invitationId: string;
  organizationId: string;
};

function useCancelInvitation() {
  return useMutation({
    mutationFn: async ({ invitationId }: CancelInvitationRequest) => {
      const { data, error } = await authClient.organization.cancelInvitation({
        invitationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to cancel invitation");
      }

      return data;
    },
    onSuccess: (_, { organizationId }) => {
      // Invalidate all organization-related queries
      queryClient.invalidateQueries({
        queryKey: ["organization-invites", organizationId],
      });

      queryClient.invalidateQueries({
        queryKey: ["organization", "full", organizationId],
      });

      queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationId],
      });

      // Also invalidate the broader organization query
      queryClient.invalidateQueries({
        queryKey: ["organization"],
      });
    },
  });
}

export default useCancelInvitation;
