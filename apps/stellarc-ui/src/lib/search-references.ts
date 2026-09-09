import type { ReferenceItem } from "@/components/task/extensions/reference-list";
import globalSearch from "@/fetchers/search/global-search";

type SearchResult = {
  id: string;
  type: string;
  title: string;
  boardId?: string;
  boardSlug?: string;
  taskNumber?: number | null;
  repoId?: string;
  repoOwner?: string;
  repoName?: string;
  organizationId?: string;
};

/** Strips a leading "#123 " that the search API prepends to issue/PR titles. */
function stripLeadingNumber(title: string) {
  return title.replace(/^#\d+\s+/, "");
}

function parseNumberFromTitle(title: string): number | null {
  const match = title.match(/^#(\d+)\s/);
  return match ? Number(match[1]) : null;
}

/**
 * Resolves a `#` autocomplete query into referenceable tasks, issues and pull
 * requests.
 *
 * Reuses the existing global search endpoint rather than adding a parallel
 * lookup: it already scopes by organization and ranks across exactly these
 * three types.
 */
export async function searchReferences({
  query,
  organizationId,
  limit = 8,
}: {
  query: string;
  organizationId: string;
  limit?: number;
}): Promise<ReferenceItem[]> {
  if (!organizationId) return [];

  const response = await globalSearch({
    q: query || "",
    type: "all",
    organizationId,
    limit,
  });

  const results = ((response as { results?: SearchResult[] })?.results ??
    []) as SearchResult[];

  const items: ReferenceItem[] = [];
  for (const result of results) {
    if (result.type === "task") {
      items.push({
        id: result.id,
        kind: "task",
        number: result.taskNumber ?? null,
        title: result.title,
        scope: result.boardSlug ?? "",
        url: `/dashboard/organization/${result.organizationId ?? organizationId}/board/${result.boardId}/task/${result.id}`,
      });
      continue;
    }

    if (result.type === "issue" || result.type === "pull_request") {
      const owner = result.repoOwner ?? "";
      const name = result.repoName ?? "";
      const number = parseNumberFromTitle(result.title);
      if (!owner || !name || number === null) continue;
      items.push({
        id: result.id,
        kind: result.type,
        number,
        title: stripLeadingNumber(result.title),
        scope: `${owner}/${name}`,
        url: `https://github.com/${owner}/${name}/${
          result.type === "issue" ? "issues" : "pull"
        }/${number}`,
      });
    }
  }

  return items.slice(0, limit);
}

export default searchReferences;
