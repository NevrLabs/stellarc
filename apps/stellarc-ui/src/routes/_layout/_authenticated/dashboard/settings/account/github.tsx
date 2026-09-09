import { createFileRoute, redirect } from "@tanstack/react-router";

// GitHub delegation belongs to the Authentication page beside linked IdPs.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/github",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/account/authentication" });
  },
});
