import { useQuery } from "@tanstack/react-query";
import { getGithubDelegationStatus } from "@/fetchers/github-delegation";

export const githubDelegationStatusQueryKey = ["github-delegation-status"];

export function useGithubDelegationStatus() {
  return useQuery({
    queryFn: getGithubDelegationStatus,
    queryKey: githubDelegationStatusQueryKey,
  });
}
