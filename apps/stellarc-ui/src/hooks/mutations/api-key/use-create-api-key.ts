import { useMutation, useQueryClient } from "@tanstack/react-query";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";

type CreateApiKeyClientRequest = {
  name: string;
  /** Lifetime in seconds (fork dialog semantics); null/undefined = never. */
  expiresIn?: number | null;
  prefix?: string;
  metadata?: Record<string, unknown>;
};

// The frozen dialog/modal contract: the modal displays the one-time secret
// returned under `key` (fork behavior — the raw key is shown exactly once,
// only the digest is persisted server-side).
type CreateApiKeyResponse = { key: string; name: string };

function useCreateApiKey() {
  const queryClient = useQueryClient();
  const { data: organization } = useActiveOrganization();

  return useMutation({
    mutationFn: async (
      data: CreateApiKeyClientRequest,
    ): Promise<CreateApiKeyResponse> => {
      const organizationId = organization?.id;
      if (!organizationId) {
        throw new Error("No active organization");
      }
      const result = await identitySend<
        IdentityMutation<{ key: { name: string | null }; secret: string }>
      >(orgPath(organizationId, "apikeys"), "POST", {
        name: data.name,
        permissions: {},
        ...(data.expiresIn
          ? {
              expiresAt: new Date(
                Date.now() + data.expiresIn * 1000,
              ).toISOString(),
            }
          : {}),
      });
      return { key: result.data.secret, name: result.data.key.name ?? "" };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export default useCreateApiKey;
