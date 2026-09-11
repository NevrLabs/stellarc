import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  disconnectGithubDelegation,
  startGithubDelegation,
} from "@/fetchers/github-delegation";
import { githubDelegationStatusQueryKey } from "@/hooks/queries/github-delegation/use-github-delegation-status";

export function useConnectGithubDelegation() {
  return useMutation({ mutationFn: async () => startGithubDelegation() });
}

export function useDisconnectGithubDelegation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectGithubDelegation,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: githubDelegationStatusQueryKey,
      }),
  });
}
