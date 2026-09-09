import { authClient } from "@/lib/auth-client";

export type GetOrganizationMembersRequest = {
  organizationId: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
};

async function getOrganizationMembers({
  organizationId,
  limit,
  offset,
  sortBy,
  sortDirection,
}: GetOrganizationMembersRequest) {
  const { data, error } = await authClient.organization.listMembers({
    query: {
      organizationId: organizationId,
      limit,
      offset,
      sortBy,
      sortDirection,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to fetch organization users");
  }

  return data || [];
}

export default getOrganizationMembers;
