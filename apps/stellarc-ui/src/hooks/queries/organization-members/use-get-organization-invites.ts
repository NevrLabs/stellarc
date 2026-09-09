import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type GetOrganizationInvitesRequest = {
  organizationId?: string;
};

function useGetOrganizationInvites({
  organizationId,
}: GetOrganizationInvitesRequest) {
  return useQuery({
    queryKey: ["organization-invites", organizationId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.listInvitations({
        query: {
          organizationId: organizationId,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to get organization invites");
      }

      return data;
    },
  });
}

export default useGetOrganizationInvites;
