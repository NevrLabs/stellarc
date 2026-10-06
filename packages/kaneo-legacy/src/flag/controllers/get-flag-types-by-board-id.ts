import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable, flagTypeTable } from "../../database/schema";

export const DEFAULT_FLAG_TYPES = [
  { name: "Blocked", color: "#ef4444", icon: "ban", position: 0 },
  { name: "Need Approval", color: "#f59e0b", icon: "stamp", position: 1 },
  { name: "Need Help", color: "#3b82f6", icon: "life-buoy", position: 2 },
  {
    name: "Need Input",
    color: "#8b5cf6",
    icon: "message-circle-question",
    position: 3,
  },
] as const;

/**
 * Board-wide flag vocabulary. Flag types are scoped to a single board, so the
 * query MUST be filtered by boardId or one board's flag types leak into
 * another. When a board has no flag types yet we lazily seed the four
 * defaults (Blocked / Need Approval / Need Help / Need Input) instead of
 * doing it in a migration, so existing boards pick them up on first read.
 */
async function getFlagTypesByBoardId(boardId: string) {
  const existing = await db
    .select()
    .from(flagTypeTable)
    .where(eq(flagTypeTable.boardId, boardId))
    .orderBy(asc(flagTypeTable.position), asc(flagTypeTable.name));

  if (existing.length > 0) {
    return existing;
  }

  const [board] = await db
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(eq(boardTable.id, boardId))
    .limit(1);

  if (!board) {
    throw new HTTPException(404, { message: "Board not found" });
  }

  const seeded = await db
    .insert(flagTypeTable)
    .values(
      DEFAULT_FLAG_TYPES.map((flagType) => ({
        boardId,
        name: flagType.name,
        color: flagType.color,
        icon: flagType.icon,
        position: flagType.position,
      })),
    )
    .onConflictDoNothing({
      target: [flagTypeTable.boardId, flagTypeTable.name],
    })
    .returning();

  if (seeded.length > 0) {
    return seeded;
  }

  return db
    .select()
    .from(flagTypeTable)
    .where(eq(flagTypeTable.boardId, boardId))
    .orderBy(asc(flagTypeTable.position), asc(flagTypeTable.name));
}

export default getFlagTypesByBoardId;
