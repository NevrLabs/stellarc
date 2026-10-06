import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { flagTypeTable } from "../../database/schema";

async function deleteFlagType(id: string) {
  const [deleted] = await db
    .delete(flagTypeTable)
    .where(eq(flagTypeTable.id, id))
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Flag type not found" });
  }

  return deleted;
}

export default deleteFlagType;
