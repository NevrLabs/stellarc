import { and, asc, eq } from "drizzle-orm";
import db from "../../../database";
import { columnTable, workflowRuleTable } from "../../../database/schema";

export async function resolveTargetStatus(
  boardId: string,
  eventType: string,
  fallbackStatus: string,
): Promise<string> {
  const boardColumns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
    })
    .from(columnTable)
    .where(eq(columnTable.boardId, boardId))
    .orderBy(asc(columnTable.position));

  if (boardColumns.length === 0) {
    return fallbackStatus;
  }

  const rule = await db.query.workflowRuleTable.findFirst({
    where: and(
      eq(workflowRuleTable.boardId, boardId),
      eq(workflowRuleTable.integrationType, "github"),
      eq(workflowRuleTable.eventType, eventType),
    ),
  });

  if (rule) {
    const mappedColumn = boardColumns.find(
      (column) => column.id === rule.columnId,
    );
    if (mappedColumn) {
      return mappedColumn.slug;
    }
  }

  const fallbackColumn = boardColumns.find(
    (column) => column.slug === fallbackStatus,
  );
  if (fallbackColumn) {
    return fallbackColumn.slug;
  }

  return boardColumns[0]?.slug ?? fallbackStatus;
}
