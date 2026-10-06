import { and, count, eq } from "drizzle-orm";
import db from "../../database";
import { notificationTable } from "../../database/schema";

async function getUnreadNotificationCount(userId: string) {
  const [result] = await db
    .select({ count: count() })
    .from(notificationTable)
    .where(
      and(
        eq(notificationTable.userId, userId),
        eq(notificationTable.isRead, false),
      ),
    );

  return Number(result?.count ?? 0);
}

export default getUnreadNotificationCount;
