import { useQuery } from "@tanstack/react-query";
import { identityGet, orgPath } from "@/lib/identity-client";
import type { RolePublic } from "@/lib/identity-collections";

export type OrganizationRole = RolePublic;

function useOrganizationRoles(organizationId: string | undefined) {
  return useQuery<RolePublic[]>({
    queryKey: ["organization-roles", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { roles } = await identityGet<{ roles: RolePublic[] }>(
        orgPath(organizationId, "roles"),
      );
      return roles;
    },
  });
}

export default useOrganizationRoles;
