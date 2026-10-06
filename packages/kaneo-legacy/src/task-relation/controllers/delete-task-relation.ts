import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function deleteTaskRelation(id: string, userId: string) {
  const [rel] = await db
    .select({
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
    })
    .from(taskRelationTable)
    .where(eq(taskRelationTable.id, id))
    .limit(1);

  if (!rel) {
    throw new HTTPException(404, {
      message: "Task relation not found",
    });
  }

  const [task] = await db
    .select({ boardId: taskTable.boardId })
    .from(taskTable)
    .where(eq(taskTable.id, rel.sourceTaskId))
    .limit(1);

  const [relation] = await db
    .delete(taskRelationTable)
    .where(eq(taskRelationTable.id, id))
    .returning();

  if (!relation) {
    throw new HTTPException(404, {
      message: "Task relation not found",
    });
  }

  if (task) {
    await publishEvent("task-relation.deleted", {
      ...relation,
      taskId: rel.sourceTaskId,
      sourceTaskId: rel.sourceTaskId,
      targetTaskId: rel.targetTaskId,
      boardId: task.boardId,
      userId,
    });
  }

  return relation;
}

export default deleteTaskRelation;
