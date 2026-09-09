import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  connectOrganizationGithubInstallation,
  disconnectOrganizationGithubInstallation,
} from "@/fetchers/organization-github/organization-github";

function invalidateOrganizationGithubInstallations(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["organization-github-installations", organizationId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["available-organization-github-installations", organizationId],
    }),
  ]);
}

export function useConnectOrganizationGithubInstallation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: connectOrganizationGithubInstallation,
    onSuccess: (_, { organizationId }) =>
      invalidateOrganizationGithubInstallations(queryClient, organizationId),
  });
}

export function useDisconnectOrganizationGithubInstallation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectOrganizationGithubInstallation,
    onSuccess: (_, { organizationId }) =>
      invalidateOrganizationGithubInstallations(queryClient, organizationId),
  });
}
