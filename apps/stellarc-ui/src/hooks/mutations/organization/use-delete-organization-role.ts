import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";

type DeleteOrganizationRoleRequest = {
  organizationId: string;
  /** The role row's id. */
  roleName: string;
};

function useDeleteOrganizationRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      roleName,
    }: DeleteOrganizationRoleRequest) => {
      const result = await identitySend<IdentityMutation<{ id: string }>>(
        orgPath(organizationId, "roles", roleName),
        "DELETE",
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

export default useDeleteOrganizationRole;
