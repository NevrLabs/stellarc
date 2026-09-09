import { authClient } from "@/lib/auth-client";

export type GetActiveOrganizationMembersRequest = {
  organizationId: string;
};

async function getActiveOrganizationMembers({
  organizationId,
}: GetActiveOrganizationMembersRequest) {
  const { data, error } = await authClient.organization.listMembers({
    query: {
      organizationId: organizationId,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to fetch organization users");
  }

  return data || [];
}

export default getActiveOrganizationMembers;
