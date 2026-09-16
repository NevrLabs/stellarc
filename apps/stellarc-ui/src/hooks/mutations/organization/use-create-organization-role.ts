import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { RolePublic } from "@/lib/identity-collections";

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
      const result = await identitySend<IdentityMutation<RolePublic>>(
        orgPath(organizationId, "roles"),
        "POST",
        { role, permission },
      );
      return result.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["organization-roles", variables.organizationId],
      });
    },
  });
}

export default useCreateOrganizationRole;
