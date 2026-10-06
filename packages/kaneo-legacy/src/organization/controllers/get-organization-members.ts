import { eq } from "drizzle-orm";
import db from "../../database";
import { organizationMemberTable, userTable } from "../../database/schema";

async function getOrganizationMembers(organizationId: string) {
  const members = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      role: organizationMemberTable.role,
    })
    .from(organizationMemberTable)
    .innerJoin(userTable, eq(organizationMemberTable.userId, userTable.id))
    .where(eq(organizationMemberTable.organizationId, organizationId));

  return members;
}

export default getOrganizationMembers;
