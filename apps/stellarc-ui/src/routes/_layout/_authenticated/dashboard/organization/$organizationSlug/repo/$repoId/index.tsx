import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues",
      params,
      replace: true,
    });
  },
});
