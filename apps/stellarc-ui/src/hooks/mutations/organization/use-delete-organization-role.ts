import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type DeleteOrganizationRoleRequest = {
  organizationId: string;
  roleName: string;
};

function useDeleteOrganizationRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      roleName,
    }: DeleteOrganizationRoleRequest) => {
      const { data, error } = await authClient.organization.deleteRole({
        organizationId: organizationId,
        roleName,
      });
      if (error) {
        throw new Error(error.message || "Failed to delete role");
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization-roles", variables.organizationId],
      });
    },
  });
}

export default useDeleteOrganizationRole;
