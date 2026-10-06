import { asc, eq } from "drizzle-orm";
import db from "../../database";
import { milestoneTable } from "../../database/schema";

/**
 * Milestones are BOARD-SCOPED. The boardId filter below is the scoping
 * guarantee: a caller must never see milestones belonging to another board.
 */
function getMilestonesByBoardId(boardId: string) {
  return db
    .select()
    .from(milestoneTable)
    .where(eq(milestoneTable.boardId, boardId))
    .orderBy(asc(milestoneTable.position), asc(milestoneTable.createdAt));
}

export default getMilestonesByBoardId;
