import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoTable } from "../../database/schema";
import getRepo from "./get-repo";

async function deleteRepo(id: string, organizationId: string) {
  // Issues and pull requests are removed by the repo_id cascade.
  const existingRepo = await getRepo(id, organizationId);

  const [deletedRepo] = await db
    .delete(repoTable)
    .where(eq(repoTable.id, id))
    .returning();

  if (!deletedRepo) {
    throw new HTTPException(500, {
      message: "Failed to delete repo",
    });
  }

  return existingRepo;
}

export default deleteRepo;
