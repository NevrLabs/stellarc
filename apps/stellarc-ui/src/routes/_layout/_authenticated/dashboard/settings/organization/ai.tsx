import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/ai",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/settings/organization/features",
      replace: true,
    });
  },
});
