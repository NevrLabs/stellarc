import { eq } from "drizzle-orm";
import db from "../../database";
import { labelTable } from "../../database/schema";

function getLabelsByOrganizationId(organizationId: string) {
  return db
    .select()
    .from(labelTable)
    .where(eq(labelTable.organizationId, organizationId));
}

export default getLabelsByOrganizationId;
