import type { TaskRepoLink } from "@/fetchers/task/get-task-repo-links";
import type { ExternalLink } from "@/types/external-link";

export function isRepoSyncedTask(
  externalLinks: ExternalLink[],
  repoLinks: TaskRepoLink[],
) {
  return (
    externalLinks.some((link) => link.resourceType === "issue") ||
    repoLinks.some((link) => link.itemType === "issues" && link.syncEnabled)
  );
}
