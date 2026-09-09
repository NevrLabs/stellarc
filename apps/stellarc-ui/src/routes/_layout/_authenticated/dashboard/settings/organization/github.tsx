import { createFileRoute, redirect } from "@tanstack/react-router";

// Organization GitHub App installations moved into the unified Connections
// page, alongside the per-user GitHub account connection.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/github",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/organization/connections" });
  },
});
