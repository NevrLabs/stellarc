import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable, flagTypeTable } from "../../database/schema";

async function createFlagType({
  boardId,
  name,
  color,
  icon,
  position,
}: {
  boardId: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  position?: number;
}) {
  const [board] = await db
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(eq(boardTable.id, boardId))
    .limit(1);

  if (!board) {
    throw new HTTPException(404, { message: "Board not found" });
  }

  const [duplicate] = await db
    .select({ id: flagTypeTable.id })
    .from(flagTypeTable)
    .where(
      and(eq(flagTypeTable.boardId, boardId), eq(flagTypeTable.name, name)),
    )
    .limit(1);

  if (duplicate) {
    throw new HTTPException(409, {
      message: "A flag type with this name already exists on this board",
    });
  }

  const [flagType] = await db
    .insert(flagTypeTable)
    .values({
      boardId,
      name,
      color: color ?? null,
      icon: icon ?? null,
      position: position ?? 0,
    })
    .returning();

  if (!flagType) {
    throw new HTTPException(500, { message: "Failed to create flag type" });
  }

  return flagType;
}

export default createFlagType;
