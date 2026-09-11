/**
 * Resolve projectSlug → project via the server-owned resolver, which handles
 * canonical + alias slugs and returns `usedSlugAlias` so callers can replace
 * the URL with the canonical slug (unlike useBoardSlug, this hits the API
 * directly instead of scanning a cached list, because Project resolution
 * must apply the same no-leak privilege check the detail route relies on).
 */

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import resolveProjectSlug from "@/fetchers/project/resolve-project-slug";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export function useProjectSlug() {
  const { projectSlug, organizationSlug } = useParams({ strict: false });
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";

  const { data: resolved, isLoading } = useQuery({
    queryKey: ["project-resolve", organizationId, projectSlug],
    queryFn: () =>
      resolveProjectSlug({ organizationId, slug: projectSlug ?? "" }),
    enabled: !!organizationId && !!projectSlug,
  });

  return {
    projectId: resolved?.id ?? "",
    project: resolved ?? null,
    usedSlugAlias: resolved?.usedSlugAlias ?? false,
    isLoading,
    organizationId,
    organizationSlug: organizationSlug ?? "",
    organization,
  };
}
