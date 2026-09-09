import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import queryClient from "@/query-client";

type DeleteOrganizationMemberRequest = {
  organizationId: string;
  userId: string;
};

function useDeleteOrganizationMember() {
  return useMutation({
    mutationFn: async ({
      organizationId,
      userId,
    }: DeleteOrganizationMemberRequest) => {
      const { data, error } = await authClient.organization.removeMember({
        memberIdOrEmail: userId,
        organizationId: organizationId,
      });

      if (error) {
        throw new Error(
          error.message || "Failed to remove organization member",
        );
      }

      return data;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["organization-invites", organizationId],
      });

      queryClient.invalidateQueries({
        queryKey: ["organization", "full", organizationId],
      });

      queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationId],
      });
    },
  });
}

export default useDeleteOrganizationMember;
