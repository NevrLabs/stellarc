import { eq } from "drizzle-orm";
import db from "../../database";
import { repoTable } from "../../database/schema";
import getRepo from "./get-repo";

type UpdateRepoOptions = {
  name?: string;
  description?: string;
  isActive?: boolean;
  config?: { icon?: string | null };
};

async function updateRepo(
  id: string,
  organizationId: string,
  updates: UpdateRepoOptions,
) {
  // Throws 404 when the repo is missing or belongs to another organization.
  const existingRepo = await getRepo(id, organizationId);

  // PATCH-style merge: only fields present in the payload are written, and
  // `config` is shallow-merged onto whatever the repo already stores.
  const values: Partial<typeof repoTable.$inferInsert> = {};

  if (updates.name !== undefined) {
    values.name = updates.name;
  }
  if (updates.description !== undefined) {
    values.description = updates.description;
  }
  if (updates.isActive !== undefined) {
    values.isActive = updates.isActive;
  }
  if (updates.config !== undefined) {
    values.config = { ...(existingRepo.config ?? {}), ...updates.config };
  }

  if (Object.keys(values).length === 0) {
    return existingRepo;
  }

  const [updatedRepo] = await db
    .update(repoTable)
    .set(values)
    .where(eq(repoTable.id, id))
    .returning();

  return updatedRepo;
}

export default updateRepo;
