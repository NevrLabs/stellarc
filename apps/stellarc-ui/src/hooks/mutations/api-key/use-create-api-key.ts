import { useMutation, useQueryClient } from "@tanstack/react-query";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { ApiKeyPublic } from "@/lib/identity-collections";

type CreateApiKeyClientRequest = {
  name: string;
  permissions: Record<string, string[]>;
  /** Expiry as an ISO date string; undefined = non-expiring. */
  expiresIn?: string;
};

type CreateApiKeyResponse = { key: ApiKeyPublic; secret: string };

function useCreateApiKey() {
  const queryClient = useQueryClient();
  const { data: organization } = useActiveOrganization();

  return useMutation({
    mutationFn: async (data: CreateApiKeyClientRequest) => {
      const organizationId = organization?.id;
      if (!organizationId) {
        throw new Error("No active organization");
      }
      const result = await identitySend<IdentityMutation<CreateApiKeyResponse>>(
        orgPath(organizationId, "apikeys"),
        "POST",
        {
          name: data.name,
          permissions: data.permissions,
          ...(data.expiresIn ? { expiresAt: data.expiresIn } : {}),
        },
      );
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export default useCreateApiKey;
