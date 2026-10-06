import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { organizationTable } from "../database/schema";

export async function assertTablesEnabled(organizationId: string) {
  const [organization] = await db
    .select({ tablesEnabled: organizationTable.tablesEnabled })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId))
    .limit(1);

  if (!organization?.tablesEnabled) {
    throw new HTTPException(404, { message: "Tables feature is not enabled" });
  }
}
