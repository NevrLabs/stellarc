import { useQuery } from "@tanstack/react-query";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { authClient } from "@/lib/auth-client";

export const useGetActiveOrganizationMember = () => {
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();

  return useQuery({
    queryKey: ["organization-member", "active", organization?.id, user?.id],
    enabled: !!organization?.id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listMembers({
        query: {
          organizationId: organization?.id,
        },
      });

      if (error) {
        throw new Error(
          error.message || "Failed to get active organization user",
        );
      }

      return data.members.find((member) => member.userId === user?.id) ?? null;
    },
  });
};
