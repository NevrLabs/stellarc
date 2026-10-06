import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable } from "../../database/schema";

async function getBoard(id: string, organizationId: string) {
  const board = await db.query.boardTable.findFirst({
    where: and(
      eq(boardTable.id, id),
      eq(boardTable.organizationId, organizationId),
    ),
    with: {
      tasks: true,
    },
  });

  if (!board) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  return board;
}

export default getBoard;
