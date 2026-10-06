import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoTable } from "../../database/schema";

async function getRepo(id: string, organizationId: string) {
  const [repo] = await db
    .select()
    .from(repoTable)
    .where(
      and(eq(repoTable.id, id), eq(repoTable.organizationId, organizationId)),
    )
    .limit(1);

  if (!repo) {
    throw new HTTPException(404, {
      message:
        "Repo doesn't exist or doesn't belong to the specified organization",
    });
  }

  return repo;
}

export default getRepo;
