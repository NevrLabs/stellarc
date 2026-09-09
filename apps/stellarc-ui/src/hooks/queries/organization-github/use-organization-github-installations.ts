import { useQuery } from "@tanstack/react-query";
import {
  getAvailableOrganizationGithubInstallations,
  getOrganizationGithubInstallations,
} from "@/fetchers/organization-github/organization-github";

export function useOrganizationGithubInstallations(organizationId: string) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => getOrganizationGithubInstallations(organizationId),
    queryKey: ["organization-github-installations", organizationId],
  });
}

export function useAvailableOrganizationGithubInstallations(
  organizationId: string,
  enabled: boolean,
) {
  return useQuery({
    enabled: Boolean(organizationId) && enabled,
    queryFn: () => getAvailableOrganizationGithubInstallations(organizationId),
    queryKey: ["available-organization-github-installations", organizationId],
  });
}
