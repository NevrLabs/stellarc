import { eq } from "drizzle-orm";
import db from "../../database";
import { columnTable, workflowRuleTable } from "../../database/schema";

async function getWorkflowRules(boardId: string) {
  const rules = await db
    .select({
      id: workflowRuleTable.id,
      boardId: workflowRuleTable.boardId,
      integrationType: workflowRuleTable.integrationType,
      eventType: workflowRuleTable.eventType,
      columnId: workflowRuleTable.columnId,
      columnName: columnTable.name,
      columnSlug: columnTable.slug,
      createdAt: workflowRuleTable.createdAt,
      updatedAt: workflowRuleTable.updatedAt,
    })
    .from(workflowRuleTable)
    .leftJoin(columnTable, eq(workflowRuleTable.columnId, columnTable.id))
    .where(eq(workflowRuleTable.boardId, boardId));

  return rules;
}

export default getWorkflowRules;
