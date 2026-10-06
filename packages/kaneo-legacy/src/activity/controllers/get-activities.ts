import { desc, eq } from "drizzle-orm";
import db from "../../database";
import { activityTable } from "../../database/schema";

async function getActivitiesFromTaskId(taskId: string) {
  /*
    Content is returned exactly as stored. A previous upstream fix for
    "Check list won't save" (#640) collapsed every newline run here
    (replace(/\n+/g, "\n")), which silently destroyed blank lines between
    paragraphs on every read — the client never received them, so no amount
    of editor-side normalization could bring them back (KFL-330).
  */
  const activities = await db.query.activityTable.findMany({
    where: eq(activityTable.taskId, taskId),
    orderBy: [desc(activityTable.createdAt)],
  });

  return activities;
}

export default getActivitiesFromTaskId;
