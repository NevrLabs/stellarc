import { useMutation } from "@tanstack/react-query";
import inviteOrganizationMember from "@/fetchers/organization-member/invite-organization-member";
import queryClient from "@/query-client";

type InviteOrganizationMemberRequest = {
  organizationId: string;
  email: string;
  role?: "owner" | "admin" | "member";
};

function useInviteOrganizationMember() {
  return useMutation({
    mutationFn: async ({
      organizationId,
      email,
      role,
    }: InviteOrganizationMemberRequest) =>
      inviteOrganizationMember({ organizationId, email, role }),
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

export default useInviteOrganizationMember;
