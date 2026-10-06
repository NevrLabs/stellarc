import { eq } from "drizzle-orm";
import { auth } from "../auth";
import db, { schema } from "../database";

async function migrateOrganizations() {
  console.log("Migrating organizations...");

  const organizations = await db.select().from(schema.organizationTable);

  for (const organization of organizations) {
    const members = await db
      .select()
      .from(schema.organizationMemberTable)
      .where(
        eq(schema.organizationMemberTable.organizationId, organization.id),
      );

    const owner = members.find((member) => member.role === "owner");

    const data = await auth.api.createOrganization({
      body: {
        name: organization.name,
        description: organization.description || undefined,
        slug:
          organization.slug ||
          organization.name.toLowerCase().replace(/\s+/g, "-"),
        userId: owner?.userId,
      },
    });

    // now we need to migrate the members
    for (const member of members) {
      await auth.api.addTeamMember({
        body: {
          teamId: data?.id || "",
          userId: member.userId,
        },
      });
    }
  }
}

export default migrateOrganizations;
