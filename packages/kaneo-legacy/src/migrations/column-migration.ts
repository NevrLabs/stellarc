import { and, eq, sql } from "drizzle-orm";
import db from "../database";
import {
  boardTable,
  columnTable,
  integrationTable,
  taskTable,
  workflowRuleTable,
} from "../database/schema";

const DEFAULT_COLUMNS = [
  { name: "To Do", slug: "to-do", position: 0, isFinal: false },
  { name: "In Progress", slug: "in-progress", position: 1, isFinal: false },
  { name: "In Review", slug: "in-review", position: 2, isFinal: false },
  { name: "Done", slug: "done", position: 3, isFinal: true },
];

const EVENT_MAPPING: Record<string, string> = {
  onBranchPush: "branch_push",
  onPROpen: "pr_opened",
  onPRMerge: "pr_merged",
};

export async function migrateColumns() {
  console.log("🔄 Starting column migration...");

  const boards = await db.select().from(boardTable);

  if (boards.length === 0) {
    console.log("No boards found, skipping column migration");
    return;
  }

  for (const board of boards) {
    const boardColumns = await db
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
      })
      .from(columnTable)
      .where(eq(columnTable.boardId, board.id));

    const columnMap = new Map<string, string>(
      boardColumns.map((column) => [column.slug, column.id]),
    );

    // Only seed missing default slugs for legacy boards that have no columns yet.
    // If the board already has columns, missing slugs are intentional (user removed them);
    // re-inserting on every startup would undo deletions after each API restart.
    if (boardColumns.length === 0) {
      for (const defaultColumn of DEFAULT_COLUMNS) {
        if (columnMap.has(defaultColumn.slug)) {
          continue;
        }

        const [inserted] = await db
          .insert(columnTable)
          .values({
            boardId: board.id,
            name: defaultColumn.name,
            slug: defaultColumn.slug,
            position: defaultColumn.position,
            isFinal: defaultColumn.isFinal,
          })
          .returning({ id: columnTable.id, slug: columnTable.slug });

        if (inserted) {
          columnMap.set(inserted.slug, inserted.id);
        }
      }
    }

    for (const [slug, columnId] of columnMap) {
      await db
        .update(taskTable)
        .set({ columnId })
        .where(
          sql`${taskTable.boardId} = ${board.id}
              AND ${taskTable.status} = ${slug}
              AND ${taskTable.columnId} IS DISTINCT FROM ${columnId}`,
        );
    }

    const integrations = await db.query.integrationTable.findMany({
      where: eq(integrationTable.boardId, board.id),
    });

    for (const integration of integrations) {
      if (
        (integration.type !== "github" && integration.type !== "gitea") ||
        !integration.isActive
      ) {
        continue;
      }

      const forgeType = integration.type as "github" | "gitea";

      try {
        const config = JSON.parse(integration.config);
        const transitions = config.statusTransitions || {};

        for (const [configKey, eventType] of Object.entries(EVENT_MAPPING)) {
          const targetSlug = transitions[configKey];
          if (!targetSlug) continue;

          const targetColumnId = columnMap.get(targetSlug);
          if (!targetColumnId) continue;

          await ensureMigrationWorkflowRule(
            board.id,
            forgeType,
            eventType as string,
            targetColumnId,
          );
        }

        // Add default rules for issue events
        const todoColumnId = columnMap.get("to-do");
        const doneColumnId = columnMap.get("done");

        if (todoColumnId) {
          await ensureMigrationWorkflowRule(
            board.id,
            forgeType,
            "issue_opened",
            todoColumnId,
          );
        }

        if (doneColumnId) {
          await ensureMigrationWorkflowRule(
            board.id,
            forgeType,
            "issue_closed",
            doneColumnId,
          );
        }
      } catch {
        console.error(
          `Failed to migrate workflow rules for integration ${integration.id}`,
        );
      }
    }
  }

  console.log(`✅ Column migration complete! Migrated ${boards.length} boards`);
}

async function ensureMigrationWorkflowRule(
  boardId: string,
  integrationType: "github" | "gitea",
  eventType: string,
  columnId: string,
) {
  const existing = await db.query.workflowRuleTable.findFirst({
    where: and(
      eq(workflowRuleTable.boardId, boardId),
      eq(workflowRuleTable.integrationType, integrationType),
      eq(workflowRuleTable.eventType, eventType),
    ),
  });

  if (existing) {
    return;
  }

  await db.insert(workflowRuleTable).values({
    boardId,
    integrationType,
    eventType,
    columnId,
  });
}
