import { eq } from "drizzle-orm";
import db from "../database";
import { organizationMemberTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import { broadcastToUser } from "./index";

/**
 * Fan repo.synced out to every member of the repo's organization.
 *
 * Repos are org-scoped while board sockets are board-scoped, so the user
 * socket is the only channel that can carry a repo mirror refresh. Clients
 * react by invalidating their repo-* query caches (see the web app's
 * use-user-websocket + invalidateRepoQueries).
 */
export async function registerRepoSyncBroadcast(): Promise<void> {
  await subscribeToEvent<{ repoId: string; organizationId: string }>(
    "repo.synced",
    async ({ repoId, organizationId }) => {
      if (!repoId || !organizationId) return;

      const members = await db
        .select({ userId: organizationMemberTable.userId })
        .from(organizationMemberTable)
        .where(eq(organizationMemberTable.organizationId, organizationId));

      for (const { userId } of members) {
        broadcastToUser(userId, { type: "REPO_SYNCED", repoId });
      }
    },
  );
}
