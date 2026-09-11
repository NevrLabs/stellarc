import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPendingInvitations } from "@/fetchers/invitation/get-pending-invitations";
import getOrganizations from "@/fetchers/organization/get-organizations";
import { authClient } from "@/lib/auth-client";
import type Organization from "@/types/organization";

export const Route = createFileRoute("/_layout/_authenticated/dashboard/")({
  beforeLoad: async () => {
    const organizations: Organization[] = await getOrganizations();
    const invitations = await getPendingInvitations();

    if (invitations && invitations.length > 0 && !organizations.length) {
      throw redirect({ to: "/invitations" });
    }

    const session = await authClient.getSession();
    const activeOrganizationId = session?.data?.session?.activeOrganizationId;

    if (organizations && organizations.length > 0) {
      if (
        activeOrganizationId &&
        organizations.some((ws) => ws.id === activeOrganizationId)
      ) {
        throw redirect({
          to: "/dashboard/organization/$organizationSlug",
          params: { organizationId: activeOrganizationId },
        });
      }

      const firstOrganization = organizations[0];

      authClient.organization.setActive({
        organizationId: firstOrganization.id,
      });

      throw redirect({
        to: "/dashboard/organization/$organizationSlug",
        params: { organizationSlug: firstOrganization.slug },
      });
    }
    throw redirect({ to: "/onboarding" });
  },
});
