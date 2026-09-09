import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board",
      replace: true,
    });
  },
});
