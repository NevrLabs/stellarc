import { useMutation, useQueryClient } from "@tanstack/react-query";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";

function useDeleteApiKey() {
  const queryClient = useQueryClient();
  const { data: organization } = useActiveOrganization();

  return useMutation({
    mutationFn: async (keyId: string) => {
      const organizationId = organization?.id;
      if (!organizationId) {
        throw new Error("No active organization");
      }
      const result = await identitySend<IdentityMutation<{ id: string }>>(
        orgPath(organizationId, "apikeys", keyId),
        "DELETE",
      );
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export default useDeleteApiKey;
