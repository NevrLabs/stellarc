import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type UpdateOrganizationRoleRequest = {
  organizationId: string;
  roleName: string;
  permission: Record<string, string[]>;
};

function useUpdateOrganizationRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      roleName,
      permission,
    }: UpdateOrganizationRoleRequest) => {
      const { data, error } = await authClient.organization.updateRole({
        organizationId: organizationId,
        roleName,
        data: { permission },
      });
      if (error) throw new Error(error.message || "Failed to update role");
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization-roles", variables.organizationId],
      });
      // The role's permission set just changed, so any cached capability
      // map for members assigned to this role is now stale.
      queryClient.invalidateQueries({
        queryKey: ["organization-capabilities", variables.organizationId],
      });
    },
  });
}

export default useUpdateOrganizationRole;
