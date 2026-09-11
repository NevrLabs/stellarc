export type DataTableField = {
  id: string;
  tableId: string;
  name: string;
  type: "text";
  position: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DataTableCell = {
  id?: string;
  rowId: string;
  fieldId: string;
  value: string;
};

export type DataTableRow = {
  id: string;
  tableId: string;
  position: number;
  cells: DataTableCell[];
  createdAt?: string;
  updatedAt?: string;
};

export type DataTableSummary = {
  id: string;
  organizationId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DataTable = DataTableSummary & {
  fields: DataTableField[];
  rows: DataTableRow[];
};

export type CreateDataTableInput = {
  organizationId: string;
  name: string;
};

export type UpdateDataTableInput = {
  organizationId: string;
  tableId: string;
  name: string;
};

export type DataTableTarget = {
  organizationId: string;
  tableId: string;
};

export type CreateDataTableFieldInput = {
  organizationId: string;
  tableId: string;
  name: string;
  type?: "text";
};

export type UpdateDataTableFieldInput = {
  organizationId: string;
  tableId: string;
  fieldId: string;
  name: string;
};

export type DataTableFieldTarget = DataTableTarget & {
  fieldId: string;
};

export type DataTableRowTarget = DataTableTarget & {
  rowId: string;
};

export type UpsertDataTableCellInput = DataTableRowTarget & {
  fieldId: string;
  value: string;
};
