import { and, desc, eq } from "drizzle-orm";
import db from "../database";
import {
  projectTable,
  projectUpdateTable,
  userTable,
} from "../database/schema";

/**
 * Canonical ProjectUpdateRow shape for the web client. Author display name is
 * joined at read time; health is the row's authored value (latest-update-wins
 * is a presentation rule, not a projection).
 */
export const projectUpdateSelection = {
  id: projectUpdateTable.id,
  organizationId: projectUpdateTable.organizationId,
  projectId: projectUpdateTable.projectId,
  authorId: projectUpdateTable.authorId,
  authorName: userTable.name,
  content: projectUpdateTable.content,
  health: projectUpdateTable.health,
  editHistory: projectUpdateTable.editHistory,
  createdAt: projectUpdateTable.createdAt,
  updatedAt: projectUpdateTable.updatedAt,
} as const;

export type ProjectUpdateRow = {
  id: string;
  organizationId: string;
  projectId: string;
  authorId: string;
  authorName: string | null;
  content: string;
  health: string;
  editHistory: Array<{ content: string; editedAt: string; userId: string }>;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function listProjectUpdates(organizationId: string, projectId: string) {
  return (
    db
      .select(projectUpdateSelection)
      .from(projectUpdateTable)
      .leftJoin(userTable, eq(projectUpdateTable.authorId, userTable.id))
      .where(
        and(
          eq(projectUpdateTable.organizationId, organizationId),
          eq(projectUpdateTable.projectId, projectId),
        ),
      )
      // Newest first. `id` breaks equal-timestamp ties stably.
      .orderBy(desc(projectUpdateTable.createdAt), desc(projectUpdateTable.id))
  );
}

/** Guard used by every controller: the parent Project must exist in-org. */
export async function projectExistsInOrganization(
  organizationId: string,
  projectId: string,
) {
  const [row] = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  return !!row;
}
