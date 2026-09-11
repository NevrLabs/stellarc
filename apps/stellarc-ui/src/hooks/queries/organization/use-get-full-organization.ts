import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type GetFullOrganizationRequest = {
  organizationId?: string;
  organizationSlug?: string;
  membersLimit?: number;
};

function useGetFullOrganization({
  organizationId,
  organizationSlug,
  membersLimit = 100,
}: GetFullOrganizationRequest) {
  return useQuery({
    queryKey: ["organization", "full", organizationId || organizationSlug],
    enabled: !!(organizationId || organizationSlug),
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization(
        {
          query: {
            organizationId: organizationId,
            membersLimit,
          },
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to get full organization");
      }

      return data;
    },
  });
}

export default useGetFullOrganization;
