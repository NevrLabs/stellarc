import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type UpdateOrganizationMemberRoleRequest = {
  organizationId: string;
  memberId: string;
  role: string;
};

function useUpdateOrganizationMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      memberId,
      role,
    }: UpdateOrganizationMemberRoleRequest) => {
      const { data, error } = await authClient.organization.updateMemberRole({
        memberId,
        organizationId: organizationId,
        role: role as "admin" | "member" | "owner",
      });

      if (error) {
        throw new Error(
          error.message || "Failed to update organization member role",
        );
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      // The members page reads from useGetFullOrganization which keys by
      // ["organization", "full", organizationId] — invalidate that exact prefix
      // so the table re-renders with the new role.
      queryClient.invalidateQueries({
        queryKey: ["organization", "full", variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", variables.organizationId],
      });
      // useGetActiveOrganizationMember is keyed ["organization-member", "active", ...]
      // and drives sidebar/role badges for the current user.
      queryClient.invalidateQueries({
        queryKey: ["organization-member", "active"],
      });
      // The active user's role may have changed; capability cache is keyed
      // by (organizationId, role) so we drop the per-organization cache.
      queryClient.invalidateQueries({
        queryKey: ["organization-capabilities", variables.organizationId],
      });
    },
  });
}

export default useUpdateOrganizationMemberRole;
