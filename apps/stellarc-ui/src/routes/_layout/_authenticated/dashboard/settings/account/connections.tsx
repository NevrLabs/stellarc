import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/connections",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/account/authentication" });
  },
});
