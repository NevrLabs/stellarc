import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { flagTypeTable } from "../../database/schema";

async function updateFlagType(
  id: string,
  values: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    position?: number;
  },
) {
  const [updated] = await db
    .update(flagTypeTable)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(flagTypeTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "Flag type not found" });
  }

  return updated;
}

export default updateFlagType;
