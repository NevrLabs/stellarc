import { eq, sql } from "drizzle-orm";
import db from "../../../database";
import { boardTable, labelTable } from "../../../database/schema";
import { findAllIntegrationsByRepo } from "../services/task-service";

type LabelCreatedPayload = {
  action: string;
  label: {
    name: string;
    color: string;
    description?: string | null;
  };
  repository: {
    owner: { login: string };
    name: string;
  };
};

export async function handleLabelCreated(payload: LabelCreatedPayload) {
  const { repository, label } = payload;

  const integrations = await findAllIntegrationsByRepo(
    repository.owner.login,
    repository.name,
  );

  for (const integration of integrations) {
    if (!integration.board) {
      continue;
    }

    const board = await db.query.boardTable.findFirst({
      where: eq(boardTable.id, integration.board.id),
    });

    if (!board?.organizationId) {
      continue;
    }

    const labelExists = await db.query.labelTable.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.organizationId, board.organizationId),
          eq(table.name, label.name),
        ),
    });

    if (labelExists) {
      continue;
    }

    const color = label.color ? `#${label.color}` : "#6B7280";

    await db
      .insert(labelTable)
      .values({
        name: label.name,
        color,
        organizationId: board.organizationId,
        source: "repo",
      })
      .onConflictDoNothing({
        target: [labelTable.organizationId, labelTable.name],
        where: sql`${labelTable.taskId} is null`,
      });
  }
}
