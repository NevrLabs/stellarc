import { useParams } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

function useActiveOrganization() {
  const {
    data: activeOrganization,
    error,
    refetch: refetchActiveOrganization,
  } = authClient.useActiveOrganization();
  const {
    data: organizations,
    isPending: isOrganizationsPending,
    refetch: refetchOrganizations,
  } = authClient.useListOrganizations();
  const params = useParams({ strict: false }) as {
    organizationSlug?: string;
    organizationId?: string;
  };
  const organizationSlug =
    typeof params?.organizationSlug === "string"
      ? params.organizationSlug
      : undefined;
  const legacyOrganizationId =
    typeof params?.organizationId === "string"
      ? params.organizationId
      : undefined;

  // Resolve org from URL: the param could be a slug OR a legacy UUID
  const organizationFromRoute = organizationSlug
    ? organizations?.find(
        (organization) =>
          organization.slug.toLowerCase() === organizationSlug.toLowerCase() ||
          organization.id === organizationSlug,
      )
    : legacyOrganizationId
      ? organizations?.find(
          (organization) => organization.id === legacyOrganizationId,
        )
      : undefined;
  const organization =
    organizationFromRoute ?? activeOrganization ?? organizations?.[0];
  const isLoading =
    ((!!organizationSlug || !!legacyOrganizationId) &&
      isOrganizationsPending &&
      !organizationFromRoute) ||
    (!organization && !error);

  return {
    data: organization,
    error,
    isLoading,
    isError: !!error,
    refetch: async () => {
      await Promise.all([refetchActiveOrganization(), refetchOrganizations()]);
    },
  };
}

export default useActiveOrganization;
