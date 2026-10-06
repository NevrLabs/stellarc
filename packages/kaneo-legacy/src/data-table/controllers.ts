import { and, asc, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  dataTableCellTable,
  dataTableFieldTable,
  dataTableRowTable,
  dataTableTable,
} from "../database/schema";

const notFound = (resource: string): never => {
  throw new HTTPException(404, { message: `${resource} not found` });
};

export function attachCellsToRows<
  TRow extends { id: string },
  TCell extends { rowId: string },
>(rows: TRow[], cells: TCell[]) {
  const cellsByRow = new Map<string, TCell[]>();
  for (const cell of cells) {
    const rowCells = cellsByRow.get(cell.rowId) ?? [];
    rowCells.push(cell);
    cellsByRow.set(cell.rowId, rowCells);
  }

  return rows.map((row) => ({
    ...row,
    cells: cellsByRow.get(row.id) ?? [],
  }));
}

async function requireTable(organizationId: string, tableId: string) {
  const [table] = await db
    .select()
    .from(dataTableTable)
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  return table ?? notFound("Data table");
}

export async function listDataTables(organizationId: string) {
  return db
    .select()
    .from(dataTableTable)
    .where(eq(dataTableTable.organizationId, organizationId))
    .orderBy(asc(dataTableTable.name));
}

export async function createDataTable(
  organizationId: string,
  values: { name: string; icon?: string | null },
) {
  const [created] = await db
    .insert(dataTableTable)
    .values({ organizationId, name: values.name, icon: values.icon ?? null })
    .returning();
  return created ?? notFound("Created data table");
}

export async function getDataTable(organizationId: string, tableId: string) {
  const table = await requireTable(organizationId, tableId);
  const [fields, rows, cells] = await Promise.all([
    db
      .select()
      .from(dataTableFieldTable)
      .where(eq(dataTableFieldTable.tableId, tableId))
      .orderBy(asc(dataTableFieldTable.position)),
    db
      .select()
      .from(dataTableRowTable)
      .where(eq(dataTableRowTable.tableId, tableId))
      .orderBy(asc(dataTableRowTable.position)),
    db
      .select({
        rowId: dataTableCellTable.rowId,
        fieldId: dataTableCellTable.fieldId,
        value: dataTableCellTable.value,
      })
      .from(dataTableCellTable)
      .innerJoin(
        dataTableRowTable,
        eq(dataTableCellTable.rowId, dataTableRowTable.id),
      )
      .where(eq(dataTableRowTable.tableId, tableId)),
  ]);
  return {
    ...table,
    fields,
    rows: attachCellsToRows(rows, cells),
  };
}

export async function updateDataTable(
  organizationId: string,
  tableId: string,
  values: { name?: string; icon?: string | null },
) {
  const [updated] = await db
    .update(dataTableTable)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .returning();
  return updated ?? notFound("Data table");
}

export async function deleteDataTable(organizationId: string, tableId: string) {
  const [deleted] = await db
    .delete(dataTableTable)
    .where(
      and(
        eq(dataTableTable.id, tableId),
        eq(dataTableTable.organizationId, organizationId),
      ),
    )
    .returning();
  return deleted ?? notFound("Data table");
}

export async function addTextField(
  organizationId: string,
  tableId: string,
  values: { name: string; position?: number },
) {
  await requireTable(organizationId, tableId);
  let position = values.position;
  if (position === undefined) {
    const [result] = await db
      .select({ position: max(dataTableFieldTable.position) })
      .from(dataTableFieldTable)
      .where(eq(dataTableFieldTable.tableId, tableId));
    position = (result?.position ?? -1) + 1;
  }
  const [created] = await db
    .insert(dataTableFieldTable)
    .values({ tableId, name: values.name, position, type: "text" })
    .returning();
  return created ?? notFound("Created data table field");
}

export async function updateTextField(
  organizationId: string,
  tableId: string,
  fieldId: string,
  values: { name?: string; position?: number },
) {
  await requireTable(organizationId, tableId);
  const [updated] = await db
    .update(dataTableFieldTable)
    .set(values)
    .where(
      and(
        eq(dataTableFieldTable.id, fieldId),
        eq(dataTableFieldTable.tableId, tableId),
        eq(dataTableFieldTable.type, "text"),
      ),
    )
    .returning();
  return updated ?? notFound("Data table field");
}

export async function deleteTextField(
  organizationId: string,
  tableId: string,
  fieldId: string,
) {
  await requireTable(organizationId, tableId);
  const [deleted] = await db
    .delete(dataTableFieldTable)
    .where(
      and(
        eq(dataTableFieldTable.id, fieldId),
        eq(dataTableFieldTable.tableId, tableId),
        eq(dataTableFieldTable.type, "text"),
      ),
    )
    .returning();
  return deleted ?? notFound("Data table field");
}

export async function addRow(
  organizationId: string,
  tableId: string,
  requestedPosition?: number,
) {
  await requireTable(organizationId, tableId);
  let position = requestedPosition;
  if (position === undefined) {
    const [result] = await db
      .select({ position: max(dataTableRowTable.position) })
      .from(dataTableRowTable)
      .where(eq(dataTableRowTable.tableId, tableId));
    position = (result?.position ?? -1) + 1;
  }
  const [created] = await db
    .insert(dataTableRowTable)
    .values({ tableId, position })
    .returning();
  return created ?? notFound("Created data table row");
}

export async function deleteRow(
  organizationId: string,
  tableId: string,
  rowId: string,
) {
  await requireTable(organizationId, tableId);
  const [deleted] = await db
    .delete(dataTableRowTable)
    .where(
      and(
        eq(dataTableRowTable.id, rowId),
        eq(dataTableRowTable.tableId, tableId),
      ),
    )
    .returning();
  return deleted ?? notFound("Data table row");
}

export async function updateCell(
  organizationId: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  value: string | null,
) {
  await requireTable(organizationId, tableId);
  const [[row], [field]] = await Promise.all([
    db
      .select({ id: dataTableRowTable.id })
      .from(dataTableRowTable)
      .where(
        and(
          eq(dataTableRowTable.id, rowId),
          eq(dataTableRowTable.tableId, tableId),
        ),
      )
      .limit(1),
    db
      .select({ id: dataTableFieldTable.id })
      .from(dataTableFieldTable)
      .where(
        and(
          eq(dataTableFieldTable.id, fieldId),
          eq(dataTableFieldTable.tableId, tableId),
          eq(dataTableFieldTable.type, "text"),
        ),
      )
      .limit(1),
  ]);
  if (!row) notFound("Data table row");
  if (!field) notFound("Data table field");

  const [cell] = await db
    .insert(dataTableCellTable)
    .values({ rowId, fieldId, value })
    .onConflictDoUpdate({
      target: [dataTableCellTable.rowId, dataTableCellTable.fieldId],
      set: { value },
    })
    .returning();
  return cell ?? notFound("Updated data table cell");
}
