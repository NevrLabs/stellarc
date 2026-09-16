import { useQuery } from "@tanstack/react-query";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { identityGet, orgPath } from "@/lib/identity-client";
import type { MemberPublic } from "@/lib/identity-collections";

export const useGetActiveOrganizationMember = () => {
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();

  return useQuery({
    queryKey: ["organization-member", "active", organization?.id, user?.id],
    enabled: !!organization?.id && !!user?.id,
    queryFn: async () => {
      const { members } = await identityGet<{ members: MemberPublic[] }>(
        orgPath(organization!.id, "members"),
      );
      return members.find((member) => member.userId === user?.id) ?? null;
    },
  });
};
