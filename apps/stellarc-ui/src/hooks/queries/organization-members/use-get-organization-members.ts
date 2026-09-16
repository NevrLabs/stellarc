import { useQuery } from "@tanstack/react-query";
import getOrganizationMembers from "@/fetchers/organization-member/get-organization-members";
import type { MemberPublic } from "@/lib/identity-collections";

type GetOrganizationMembersRequest = {
  organizationId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterOperator?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains";
  filterValue?: string;
};

function useGetOrganizationMembers({
  organizationId,
}: GetOrganizationMembersRequest = {}) {
  return useQuery({
    queryKey: ["organization-members", organizationId],
    enabled: !!organizationId,
    queryFn: () => getOrganizationMembers({ organizationId: organizationId! }),
  });
}

export default useGetOrganizationMembers;
