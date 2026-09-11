import type { QueryClient } from "@tanstack/react-query";

/**
 * #123: queries that must be refreshed after an agent is created or removed.
 *
 * An agent is also an organization member, so it appears in views fed by
 * queries that have nothing to do with the `agents` key. Removing an agent
 * used to invalidate only `["agents", orgId]`, which left the Members page
 * showing the deleted agent until a manual refresh.
 *
 * Kept as one helper so create and delete cannot drift apart — the original
 * bug existed in both.
 */
export function invalidateAgentMembershipQueries(
  queryClient: QueryClient,
  organizationId: string | undefined,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["agents", organizationId] }),
    // Members page (`useGetFullOrganization`).
    queryClient.invalidateQueries({
      queryKey: ["organization", "full", organizationId],
    }),
    // Member pickers and lists.
    queryClient.invalidateQueries({
      queryKey: ["active-organization-members", organizationId],
    }),
    // Paginated member table: the key carries paging/sort args after the id,
    // so match on the prefix rather than an exact key.
    queryClient.invalidateQueries({
      queryKey: ["organization-members", organizationId],
    }),
  ]);
}
