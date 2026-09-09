import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

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
  limit,
  offset,
  sortBy,
  sortDirection,
  filterField,
  filterOperator,
  filterValue,
}: GetOrganizationMembersRequest) {
  return useQuery({
    queryKey: [
      "organization-members",
      organizationId,
      limit,
      offset,
      sortBy,
      sortDirection,
      filterField,
      filterOperator,
      filterValue,
    ],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listMembers({
        query: {
          organizationId: organizationId,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to get organization users");
      }

      return data.members;
    },
  });
}

export default useGetOrganizationMembers;
