/**
 * Resolve a board by slug within an organization.
 * Used by route beforeLoad to convert board slug → board UUID.
 */
import { getApiUrl } from "../get-api-url";

export type ResolvedBoard = {
  id: string;
  slug: string;
  name: string;
};

const boardCache = new Map<string, ResolvedBoard>();

export async function resolveBoardBySlug(
  organizationId: string,
  boardSlug: string,
): Promise<ResolvedBoard | null> {
  const cacheKey = `${organizationId}:${boardSlug}`;
  if (boardCache.has(cacheKey)) {
    return boardCache.get(cacheKey)!;
  }

  const response = await fetch(
    getApiUrl(`/board?organizationId=${encodeURIComponent(organizationId)}`),
    { credentials: "include" },
  );
  if (!response.ok) return null;
  const boards = (await response.json()) as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  const board = boards.find(
    (b) => b.slug.toLowerCase() === boardSlug.toLowerCase(),
  );
  if (board) {
    boardCache.set(cacheKey, board);
    return board;
  }
  return null;
}
