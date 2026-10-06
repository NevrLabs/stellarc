import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable } from "../../database/schema";

async function deleteMilestone(boardId: string, id: string) {
  // Delete only after board ownership is proven by the predicate. The foreign
  // key clears task assignments with ON DELETE SET NULL; pre-clearing them
  // would let a mismatched boardId mutate another board before returning 404.
  const [milestone] = await db
    .delete(milestoneTable)
    .where(and(eq(milestoneTable.id, id), eq(milestoneTable.boardId, boardId)))
    .returning();

  if (!milestone) {
    throw new HTTPException(404, { message: "Milestone not found" });
  }

  return milestone;
}

export default deleteMilestone;
