import { and, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable } from "../../database/schema";

async function updateMilestone(
  boardId: string,
  id: string,
  updates: {
    name?: string;
    description?: string | null;
    dueDate?: string | null;
    status?: string;
    position?: number;
  },
) {
  const [existing] = await db
    .select()
    .from(milestoneTable)
    .where(and(eq(milestoneTable.id, id), eq(milestoneTable.boardId, boardId)))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Milestone not found" });
  }

  if (updates.name !== undefined && updates.name !== existing.name) {
    const duplicate = await db
      .select({ id: milestoneTable.id })
      .from(milestoneTable)
      .where(
        and(
          eq(milestoneTable.boardId, boardId),
          eq(milestoneTable.name, updates.name),
          ne(milestoneTable.id, id),
        ),
      )
      .limit(1);

    if (duplicate.length > 0) {
      throw new HTTPException(409, {
        message: "A milestone with this name already exists on this board",
      });
    }
  }

  const nextStatus = updates.status ?? existing.status;

  const [milestone] = await db
    .update(milestoneTable)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined
        ? { description: updates.description }
        : {}),
      ...(updates.dueDate !== undefined
        ? { dueDate: updates.dueDate ? new Date(updates.dueDate) : null }
        : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.position !== undefined ? { position: updates.position } : {}),
      completedAt:
        nextStatus === "completed"
          ? (existing.completedAt ?? new Date())
          : null,
    })
    .where(and(eq(milestoneTable.id, id), eq(milestoneTable.boardId, boardId)))
    .returning();

  if (!milestone) {
    throw new HTTPException(404, { message: "Milestone not found" });
  }

  return milestone;
}

export default updateMilestone;
