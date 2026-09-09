import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug",
)({
  component: RouteComponent,
});

function RouteComponent() {
  // Keep better-auth's session-active organization in sync with the org in
  // the URL. Team/member endpoints authorize against the session's active
  // organization, so landing directly on a slug URL without this sync makes
  // those calls 400 (e.g. list-team-members) even though the URL is valid.
  const { data: organization } = useActiveOrganization();
  const { data: sessionActive } = authClient.useActiveOrganization();
  const syncingRef = useRef<string | null>(null);

  useEffect(() => {
    const targetId = organization?.id;
    if (!targetId) return;
    if (sessionActive?.id === targetId) return;
    if (syncingRef.current === targetId) return;
    syncingRef.current = targetId;
    void authClient.organization
      .setActive({ organizationId: targetId })
      .finally(() => {
        syncingRef.current = null;
      });
  }, [organization?.id, sessionActive?.id]);

  return <Outlet />;
}
