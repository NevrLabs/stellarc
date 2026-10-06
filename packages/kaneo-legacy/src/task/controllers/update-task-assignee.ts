import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  organizationMemberTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import ensureTaskFollowers from "./ensure-task-followers";

async function updateTaskAssignee({
  id,
  userId,
  teamId,
  currentUserId,
  organizationId,
}: {
  id: string;
  userId: string | null;
  teamId: string | null;
  currentUserId: string;
  organizationId: string;
}) {
  if (userId && teamId) {
    throw new HTTPException(400, {
      message: "A task can only be assigned to one user or team",
    });
  }

  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });
  if (!existingTask)
    throw new HTTPException(404, { message: "Task not found" });

  let newAssigneeName: string | undefined;
  if (userId) {
    const [member] = await db
      .select({ name: userTable.name })
      .from(organizationMemberTable)
      .innerJoin(userTable, eq(organizationMemberTable.userId, userTable.id))
      .where(
        and(
          eq(organizationMemberTable.organizationId, organizationId),
          eq(organizationMemberTable.userId, userId),
        ),
      )
      .limit(1);
    if (!member) {
      throw new HTTPException(400, {
        message: "User does not belong to the organization",
      });
    }
    newAssigneeName = member.name;
  }
  if (teamId) {
    const [team] = await db
      .select({ name: teamTable.name })
      .from(teamTable)
      .where(
        and(
          eq(teamTable.organizationId, organizationId),
          eq(teamTable.id, teamId),
        ),
      )
      .limit(1);
    if (!team) {
      throw new HTTPException(400, {
        message: "Team does not belong to the organization",
      });
    }
    newAssigneeName = team.name;
  }

  if (existingTask.userId === userId && existingTask.teamId === teamId) {
    return existingTask;
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({ userId, teamId })
    .where(eq(taskTable.id, id))
    .returning();
  if (!updatedTask) {
    throw new HTTPException(500, { message: "Failed to update task assignee" });
  }

  if (userId) {
    await ensureTaskFollowers({ taskId: updatedTask.id, userIds: [userId] });
  }

  if (!userId && !teamId) {
    await publishEvent("task.unassigned", {
      taskId: updatedTask.id,
      boardId: updatedTask.boardId,
      userId: currentUserId,
      title: updatedTask.title,
      type: "unassigned",
    });
    return updatedTask;
  }

  await publishEvent("task.assignee_changed", {
    taskId: updatedTask.id,
    boardId: updatedTask.boardId,
    userId: currentUserId,
    oldAssignee: existingTask.userId ?? existingTask.teamId,
    newAssignee: newAssigneeName,
    newAssigneeId: userId ?? teamId,
    title: updatedTask.title,
    type: "assignee_changed",
  });
  return updatedTask;
}

export default updateTaskAssignee;
