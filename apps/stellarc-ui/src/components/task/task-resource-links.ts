import type { ExternalLink } from "@/types/external-link";

type ManualLink = { url: string; itemType: string };

/**
 * Chooses which auto-synced external links belong in the task's Resources list.
 *
 * The canonical synced GitHub issue renders here — and only here — carrying a
 * `[Synced]` badge (#75). It used to be repeated in the properties info bar and
 * under the label list, which the Resources list already conveys.
 */
export function selectResourceAutoLinks(
  externalLinks: ExternalLink[],
  links: ManualLink[],
) {
  const manualUrls = new Set(links.map((item) => item.url));

  // A branch link is noise once its pull request is present.
  const hasPullRequest =
    links.some((item) => item.itemType === "pull-requests") ||
    externalLinks.some((link) => link.resourceType === "pull_request");

  return externalLinks.filter((link) => {
    // The synced issue BELONGS here: #75 moved it out of the info bar and the
    // label list into Resources. Excluding it was the old behaviour inverted —
    // it removed the remark from the one place the user asked to keep it.
    if (manualUrls.has(link.url)) return false;
    if (hasPullRequest && link.resourceType === "branch") return false;
    return true;
  });
}

/**
 * Maps a `repo-links` row's `itemType` onto the `ExternalLink` resource-type
 * vocabulary used by the `[Synced]` badge.
 *
 * The Resources list renders two different row shapes: auto-synced rows carry
 * `resourceType` ("issue" | "pull_request" | "branch"), while manually linked
 * rows carry `itemType` ("issues" | "pull-requests"). #75 was reported as "not
 * fixed" partly because only the first shape reached the badge, so a manually
 * linked synced issue displayed no badge at all.
 */
export function repoLinkSyncResourceType(
  itemType: string,
): ExternalLink["resourceType"] {
  return itemType === "issues" ? "issue" : "pull_request";
}

/**
 * How many times the synced-issue remark is rendered for a task.
 *
 * Guards the #75 consolidation: the remark exists once, in Resources.
 */
export function countSyncedIssueRemarks(externalLinks: ExternalLink[]) {
  return selectResourceAutoLinks(externalLinks, []).filter(
    (link) => link.resourceType === "issue",
  ).length;
}
