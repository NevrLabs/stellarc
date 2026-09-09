import { client } from "@kaneo/libs";

export type ResolveTaskFlagRequest = {
  flagId: string;
  taskId?: string;
  /** #107: unflagging requires a written reason; the API rejects an empty one. */
  resolveNote: string;
};

/**
 * Unflagging is a POST (not a PUT) and keeps the row so history records who
 * resolved it, when, and why.
 */
async function resolveTaskFlag({
  flagId,
  resolveNote,
}: ResolveTaskFlagRequest) {
  const response = await client.flag[":id"].resolve.$post({
    param: { id: flagId },
    json: { resolveNote },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default resolveTaskFlag;
