import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { organizationMemberTable, teamTable } from "../database/schema";

/**
 * Ordinary FKs cannot enforce "the lead is an active member of THIS
 * organization" or "the lead team belongs to THIS organization" — a FK only
 * proves the row exists somewhere. Controllers must call this before every
 * create/update that sets leadUserId/leadTeamId.
 */
export async function validateProjectLeads(input: {
  organizationId: string;
  leadUserId: string;
  leadTeamId?: string | null;
}) {
  const [membership] = await db
    .select({ id: organizationMemberTable.id })
    .from(organizationMemberTable)
    .where(
      and(
        eq(organizationMemberTable.organizationId, input.organizationId),
        eq(organizationMemberTable.userId, input.leadUserId),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new HTTPException(400, {
      message: "Project lead must be an active member of the organization",
    });
  }

  if (input.leadTeamId) {
    const [team] = await db
      .select({ id: teamTable.id })
      .from(teamTable)
      .where(
        and(
          eq(teamTable.id, input.leadTeamId),
          eq(teamTable.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!team) {
      throw new HTTPException(400, {
        message: "Project lead team must belong to the organization",
      });
    }
  }
}
