import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type CreateOrganizationRoleRequest = {
  organizationId: string;
  role: string;
  permission: Record<string, string[]>;
};

function useCreateOrganizationRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      role,
      permission,
    }: CreateOrganizationRoleRequest) => {
      const { data, error } = await authClient.organization.createRole({
        organizationId: organizationId,
        role,
        permission,
      });
      if (error) {
        throw new Error(error.message || "Failed to create role");
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

export default useCreateOrganizationRole;
