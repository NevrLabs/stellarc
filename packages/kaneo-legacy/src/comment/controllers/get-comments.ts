import { and, asc, eq, isNotNull } from "drizzle-orm";
import db from "../../database";
import { activityTable, userTable } from "../../database/schema";

async function getComments(taskId: string) {
  const comments = await db
    .select({
      id: activityTable.id,
      taskId: activityTable.taskId,
      userId: userTable.id,
      content: activityTable.content,
      createdAt: activityTable.createdAt,
      updatedAt: activityTable.updatedAt,
      userName: userTable.name,
      userImage: userTable.image,
      externalUserName: activityTable.externalUserName,
      externalUserAvatar: activityTable.externalUserAvatar,
    })
    .from(activityTable)
    .leftJoin(userTable, eq(activityTable.userId, userTable.id))
    .where(
      and(
        eq(activityTable.taskId, taskId),
        eq(activityTable.type, "comment"),
        isNotNull(activityTable.content),
      ),
    )
    .orderBy(asc(activityTable.createdAt));

  return comments.map((c) => ({
    id: c.id,
    taskId: c.taskId,
    userId: c.userId,
    content: c.content as string,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    user: {
      name: c.userName ?? c.externalUserName ?? "Unknown",
      image: c.userImage ?? c.externalUserAvatar,
    },
  }));
}

export default getComments;
