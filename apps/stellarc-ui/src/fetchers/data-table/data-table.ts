import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  CreateDataTableFieldInput,
  CreateDataTableInput,
  DataTable,
  DataTableField,
  DataTableFieldTarget,
  DataTableRow,
  DataTableRowTarget,
  DataTableSummary,
  DataTableTarget,
  UpdateDataTableFieldInput,
  UpdateDataTableInput,
  UpsertDataTableCellInput,
} from "@/types/data-table";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Data table request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const base = (organizationId: string) =>
  `/data-table/organization/${encodeURIComponent(organizationId)}`;

export const getDataTables = (organizationId: string) =>
  request<DataTableSummary[]>(base(organizationId));

export const getDataTable = (tableId: string, organizationId: string) =>
  request<DataTable>(`${base(organizationId)}/${encodeURIComponent(tableId)}`);

export const createDataTable = ({
  organizationId,
  name,
}: CreateDataTableInput) =>
  request<DataTableSummary>(base(organizationId), {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateDataTable = ({
  organizationId,
  tableId,
  name,
}: UpdateDataTableInput) =>
  request<DataTableSummary>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}`,
    { method: "PUT", body: JSON.stringify({ name }) },
  );

export const deleteDataTable = ({ organizationId, tableId }: DataTableTarget) =>
  request<DataTableSummary>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}`,
    { method: "DELETE" },
  );

export const createDataTableField = ({
  organizationId,
  tableId,
  name,
}: CreateDataTableFieldInput) =>
  request<DataTableField>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/fields`,
    { method: "POST", body: JSON.stringify({ name }) },
  );

export const updateDataTableField = ({
  organizationId,
  tableId,
  fieldId,
  name,
}: UpdateDataTableFieldInput) =>
  request<DataTableField>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/fields/${encodeURIComponent(fieldId)}`,
    { method: "PUT", body: JSON.stringify({ name }) },
  );

export const deleteDataTableField = ({
  organizationId,
  tableId,
  fieldId,
}: DataTableFieldTarget) =>
  request<DataTableField>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/fields/${encodeURIComponent(fieldId)}`,
    { method: "DELETE" },
  );

export const createDataTableRow = ({
  organizationId,
  tableId,
}: Pick<DataTableRowTarget, "organizationId" | "tableId">) =>
  request<DataTableRow>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/rows`,
    { method: "POST", body: JSON.stringify({}) },
  );

export const deleteDataTableRow = ({
  organizationId,
  tableId,
  rowId,
}: DataTableRowTarget) =>
  request<DataTableRow>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`,
    { method: "DELETE" },
  );

export const upsertDataTableCell = ({
  organizationId,
  tableId,
  rowId,
  fieldId,
  value,
}: UpsertDataTableCellInput) =>
  request<void>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}/cells/${encodeURIComponent(fieldId)}`,
    { method: "PUT", body: JSON.stringify({ value }) },
  );
