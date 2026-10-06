import { DEFAULT_ROLE_NAMES, defaultRolePayloads } from "@kaneo/permissions";
import { and, inArray, sql } from "drizzle-orm";
import db, { schema } from "../database";

/**
 * Backfill the editable default roles (viewer/member/admin) for every
 * organization that's missing them. Runs on API startup after Drizzle
 * migrations.
 *
 * These three roles used to be static (compiled into better-auth's
 * `roles` config). They were converted to DB rows so admins can override
 * them per organization — but that means existing organizations, which were
 * created before the switch, have no rows yet. Without this backfill,
 * better-auth's dynamic-access-control resolution would treat them as
 * having an empty permission set on existing organizations.
 *
 * Idempotent: only inserts rows that aren't already present.
 */
export async function seedDefaultOrganizationRoles() {
  try {
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'organization_role'
      ) AS exists;
    `);

    const exists =
      tableExists.rows[0]?.exists === true ||
      tableExists.rows[0]?.exists === "t";
    if (!exists) {
      console.log(
        "🛈 organization_role table does not exist — skipping default-role seed.",
      );
      return;
    }

    const organizations = await db
      .select({ id: schema.organizationTable.id })
      .from(schema.organizationTable);

    if (organizations.length === 0) {
      return;
    }

    const organizationIds = organizations.map((w) => w.id);

    const existingRows = await db
      .select({
        organizationId: schema.organizationRoleTable.organizationId,
        role: schema.organizationRoleTable.role,
      })
      .from(schema.organizationRoleTable)
      .where(
        and(
          inArray(schema.organizationRoleTable.organizationId, organizationIds),
          inArray(
            schema.organizationRoleTable.role,
            DEFAULT_ROLE_NAMES as unknown as string[],
          ),
        ),
      );

    const present = new Set(
      existingRows.map((r) => `${r.organizationId}:${r.role}`),
    );

    const now = new Date();
    const rows: Array<typeof schema.organizationRoleTable.$inferInsert> = [];
    for (const organizationId of organizationIds) {
      for (const name of DEFAULT_ROLE_NAMES) {
        if (present.has(`${organizationId}:${name}`)) continue;
        rows.push({
          organizationId,
          role: name,
          permission: JSON.stringify(defaultRolePayloads[name]),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (rows.length === 0) {
      return;
    }

    // Postgres' bind protocol caps parameters at 65535 per query, so insert
    // in chunks. 6 columns × 1000 rows = 6000 params per batch, leaving ample
    // headroom even for instances with tens of thousands of organizations.
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db
        .insert(schema.organizationRoleTable)
        .values(rows.slice(i, i + BATCH_SIZE));
    }
    console.log(
      `✅ Seeded ${rows.length} default organization role row(s) across ${organizationIds.length} organization(s).`,
    );
  } catch (error) {
    console.error("❌ Failed to seed default organization roles:", error);
    throw error;
  }
}
