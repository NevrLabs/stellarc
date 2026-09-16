import { useQuery } from "@tanstack/react-query";
import getActiveOrganizationMembers from "@/fetchers/organization-member/get-active-organization-members";
import type { MemberPublic } from "@/lib/identity-collections";

export function useGetActiveOrganizationMembers(organizationId: string) {
  return useQuery({
    queryKey: ["active-organization-members", organizationId],
    queryFn: () => getActiveOrganizationMembers({ organizationId }),
    enabled: !!organizationId,
  });
}
