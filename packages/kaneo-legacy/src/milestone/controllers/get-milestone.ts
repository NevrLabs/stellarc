import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable } from "../../database/schema";

async function getMilestone(boardId: string, id: string) {
  const [milestone] = await db
    .select()
    .from(milestoneTable)
    .where(and(eq(milestoneTable.id, id), eq(milestoneTable.boardId, boardId)))
    .limit(1);

  if (!milestone) {
    throw new HTTPException(404, { message: "Milestone not found" });
  }

  return milestone;
}

export default getMilestone;
