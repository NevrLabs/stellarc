import { useQuery } from "@tanstack/react-query";
import { getLinkedAuthenticationIdentities } from "@/fetchers/account-authentication";

export const linkedAuthenticationIdentitiesQueryKey = [
  "linked-authentication-identities",
] as const;

export function useLinkedAuthenticationIdentities() {
  return useQuery({
    queryKey: linkedAuthenticationIdentitiesQueryKey,
    queryFn: getLinkedAuthenticationIdentities,
  });
}
