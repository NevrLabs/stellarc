import { useMutation } from "@tanstack/react-query";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { MemberPublic } from "@/lib/identity-collections";
import queryClient from "@/query-client";

type UpdateOrganizationMemberRoleRequest = {
  organizationId: string;
  memberId: string;
  role: string;
};

function useUpdateOrganizationMemberRole() {
  return useMutation({
    mutationFn: async ({
      organizationId,
      memberId,
      role,
    }: UpdateOrganizationMemberRoleRequest) => {
      const result = await identitySend<IdentityMutation<MemberPublic>>(
        orgPath(organizationId, "members", memberId),
        "PATCH",
        { role },
      );
      return result.data;
    },
    onSuccess: (_, { organizationId }) => {
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

export default useUpdateOrganizationMemberRole;
