import { useQuery } from "@tanstack/react-query";
import getOrganizationPrincipals from "@/fetchers/organization-member/get-organization-principals";

/**
 * KFL-160: principals carry an explicit `kind` ("user" | "agent") that
 * listMembers cannot expose, so pickers that must tell agents apart from
 * humans use this hook rather than useGetActiveOrganizationMembers.
 */
export function useGetOrganizationPrincipals(
  organizationId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["organization-principals", organizationId],
    queryFn: () => getOrganizationPrincipals(organizationId as string),
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  });
}

export default useGetOrganizationPrincipals;
