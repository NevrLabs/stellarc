import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable } from "../../database/schema";
import getBoard from "./get-board";

async function deleteBoard(id: string, organizationId: string) {
  const existingBoard = await getBoard(id, organizationId);

  const [deletedBoard] = await db
    .delete(boardTable)
    .where(eq(boardTable.id, id))
    .returning();

  if (!deletedBoard) {
    throw new HTTPException(500, {
      message: "Failed to delete board",
    });
  }

  return existingBoard;
}

export default deleteBoard;
