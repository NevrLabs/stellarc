import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { RolePublic } from "@/lib/identity-collections";

type UpdateOrganizationRoleRequest = {
  organizationId: string;
  /** The role row's id (the role route keys rows by id, not name). */
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
      const result = await identitySend<IdentityMutation<RolePublic>>(
        orgPath(organizationId, "roles", roleName),
        "PATCH",
        { permission },
      );
      return result.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["organization-roles", variables.organizationId],
      });
      // The role's permission set just changed, so any cached capability
      // map for members assigned to this role is now stale.
      void queryClient.invalidateQueries({
        queryKey: ["organization-capabilities", variables.organizationId],
      });
    },
  });
}

export default useUpdateOrganizationRole;
