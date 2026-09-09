import { Badge } from "@/components/ui/badge";
import type { ExternalLink } from "@/types/external-link";

/**
 * Issue external links are the task's bidirectionally synced GitHub issue.
 * Pull requests and branches are integration context, not synced issue state.
 */
export function ResourceSyncBadge({
  resourceType,
}: {
  resourceType: ExternalLink["resourceType"];
}) {
  if (resourceType !== "issue") return null;

  return (
    <Badge className="shrink-0" variant="outline">
      Synced
    </Badge>
  );
}
