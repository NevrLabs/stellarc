import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/fetchers/get-api-url";

export type IdentityAliasInventory = {
  organization: { currentSlug: string; aliases: string[] };
  boards: Array<{
    boardId: string;
    boardName: string;
    currentKey: string;
    aliases: string[];
  }>;
};

export default function useIdentityAliases(organizationId?: string) {
  return useQuery({
    queryKey: ["organization", organizationId, "identity-aliases"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(`/organization/${organizationId}/identity-aliases`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load identity aliases");
      return response.json() as Promise<IdentityAliasInventory>;
    },
  });
}
