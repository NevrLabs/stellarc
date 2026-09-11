import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/agents",
)({
  beforeLoad: async () => {
    const { data: organization } =
      await authClient.organization.getFullOrganization();
    if (!organization?.slug) return;
    throw redirect({
      to: "/dashboard/organization/$organizationSlug/members",
      params: { organizationSlug: organization.slug },
      search: { tab: "members" },
      replace: true,
    });
  },
  component: AgentSettings,
});

/**
 * AI agents belong to an organization, not to a personal account: their key is
 * scoped to one organization and only an owner/admin may issue or revoke one.
 * This route redirects to the organization members surface where agents are
 * shown as first-class members and their credentials are managed.
 */
function AgentSettings() {
  return null;
}
