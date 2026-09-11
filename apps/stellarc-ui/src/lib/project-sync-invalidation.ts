import type { QueryClient } from "@tanstack/react-query";

/**
 * Drop every cached Project-domain query after a create/update/rename-slug/
 * archive/unarchive push from another tab or user.
 *
 * Kaneo disables refetch-on-focus, so without this push the Projects
 * overview, a project detail page and the sidebar's Projects entry would
 * never learn about a change made elsewhere. `projects` is the org-scoped
 * list (invalidated by prefix — list queries carry organizationId and the
 * includeArchived filter as extra key segments); `project` is the per-id
 * detail query; `sidebar` covers the sidebar's own project-derived state.
 */
export function invalidateProjectQueries(
  queryClient: QueryClient,
  projectId?: string,
): void {
  queryClient.invalidateQueries({ queryKey: ["projects"] });
  queryClient.invalidateQueries({ queryKey: ["project"] });
  queryClient.invalidateQueries({ queryKey: ["project-tickets"] });
  queryClient.invalidateQueries({ queryKey: ["project-milestones"] });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-tickets", projectId] });
    queryClient.invalidateQueries({
      queryKey: ["project-milestones", projectId],
    });
  }
  queryClient.invalidateQueries({
    queryKey: projectId ? ["project", projectId] : ["project"],
  });
  queryClient.invalidateQueries({
    queryKey: projectId
      ? ["project-resources", projectId]
      : ["project-resources"],
  });
  queryClient.invalidateQueries({ queryKey: ["sidebar"] });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ["project-updates", projectId] });
    queryClient.invalidateQueries({
      queryKey: ["project-updates", "latest", projectId],
    });
  }
}
