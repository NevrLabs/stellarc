import { createFileRoute, redirect } from "@tanstack/react-router";

// Connections now lives under Account and Organization separately. Keep this
// path working for existing links and bookmarks.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/connections",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/account/authentication" });
  },
});
