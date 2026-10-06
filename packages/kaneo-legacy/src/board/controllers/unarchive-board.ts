import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable } from "../../database/schema";

async function unarchiveBoard(id: string, organizationId: string) {
  const [existingBoard] = await db
    .select()
    .from(boardTable)
    .where(
      and(eq(boardTable.id, id), eq(boardTable.organizationId, organizationId)),
    );

  if (!existingBoard) {
    throw new HTTPException(404, {
      message:
        "Board doesn't exist or doesn't belong to the specified organization",
    });
  }

  const [unarchivedBoard] = await db
    .update(boardTable)
    .set({ archivedAt: null })
    .where(eq(boardTable.id, id))
    .returning();

  if (!unarchivedBoard) {
    throw new HTTPException(500, {
      message: "Failed to unarchive board",
    });
  }

  return unarchivedBoard;
}

export default unarchiveBoard;
