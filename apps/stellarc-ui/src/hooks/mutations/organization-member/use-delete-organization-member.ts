import { useMutation } from "@tanstack/react-query";
import deleteOrganizationMember from "@/fetchers/organization-member/delete-organization-member";
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
    }: DeleteOrganizationMemberRequest) =>
      deleteOrganizationMember({ organizationId, userId }),
    onSuccess: (_, { organizationId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["organization-invites", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["organization", "full", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["active-organization-members", organizationId],
      });
    },
  });
}

export default useDeleteOrganizationMember;
