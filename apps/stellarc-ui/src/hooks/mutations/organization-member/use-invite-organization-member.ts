import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import queryClient from "@/query-client";

type InviteOrganizationMemberRequest = {
  organizationId: string;
  email: string;
  role: "admin" | "member" | "owner";
  resend?: boolean;
};

function useInviteOrganizationMember() {
  return useMutation({
    mutationFn: async ({
      organizationId,
      email,
      role,
      resend,
    }: InviteOrganizationMemberRequest) => {
      const { data, error } = await authClient.organization.inviteMember({
        email,
        role,
        organizationId: organizationId,
        resend,
      });

      if (error) {
        throw new Error(
          error.message || "Failed to invite organization member",
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

export default useInviteOrganizationMember;
