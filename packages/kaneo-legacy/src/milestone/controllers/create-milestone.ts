import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable, milestoneTable } from "../../database/schema";

async function createMilestone({
  boardId,
  name,
  description,
  dueDate,
  status,
}: {
  boardId: string;
  name: string;
  description?: string | null;
  dueDate?: string | null;
  status?: string;
}) {
  const [board] = await db
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(eq(boardTable.id, boardId))
    .limit(1);

  if (!board) {
    throw new HTTPException(404, { message: "Board not found" });
  }

  const existing = await db
    .select({ id: milestoneTable.id })
    .from(milestoneTable)
    .where(
      and(eq(milestoneTable.boardId, boardId), eq(milestoneTable.name, name)),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: "A milestone with this name already exists on this board",
    });
  }

  const [milestone] = await db
    .insert(milestoneTable)
    .values({
      boardId,
      name,
      description: description ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      status: status ?? "planned",
    })
    .returning();

  if (!milestone) {
    throw new HTTPException(500, { message: "Failed to create milestone" });
  }

  return milestone;
}

export default createMilestone;
