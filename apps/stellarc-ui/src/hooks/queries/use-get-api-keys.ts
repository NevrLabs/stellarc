import { useQuery } from "@tanstack/react-query";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { identityGet, orgPath } from "@/lib/identity-client";
import type { ApiKeyPublic } from "@/lib/identity-collections";

function useGetApiKeys() {
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: ["api-keys", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { keys } = await identityGet<{ keys: ApiKeyPublic[] }>(
        orgPath(organizationId, "apikeys"),
      );
      return keys;
    },
  });
}

export default useGetApiKeys;
