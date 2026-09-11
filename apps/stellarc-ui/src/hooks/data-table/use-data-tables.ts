import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDataTable,
  createDataTableField,
  createDataTableRow,
  deleteDataTable,
  deleteDataTableField,
  deleteDataTableRow,
  getDataTable,
  getDataTables,
  updateDataTable,
  updateDataTableField,
  upsertDataTableCell,
} from "@/fetchers/data-table/data-table";

export const dataTableKeys = {
  all: ["data-tables"] as const,
  list: (organizationId: string) => ["data-tables", organizationId] as const,
  detail: (organizationId: string, tableId: string) =>
    ["data-table", organizationId, tableId] as const,
};

export function useDataTables(organizationId: string, enabled = true) {
  return useQuery({
    queryKey: dataTableKeys.list(organizationId),
    queryFn: () => getDataTables(organizationId),
    enabled: Boolean(organizationId) && enabled,
  });
}

export function useDataTable(organizationId: string, tableId: string) {
  return useQuery({
    queryKey: dataTableKeys.detail(organizationId, tableId),
    queryFn: () => getDataTable(tableId, organizationId),
    enabled: Boolean(organizationId && tableId),
  });
}

export function useDataTableMutations(
  organizationId: string,
  tableId?: string,
) {
  const queryClient = useQueryClient();
  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: dataTableKeys.list(organizationId),
    });
  const refreshDetail = () =>
    tableId
      ? queryClient.invalidateQueries({
          queryKey: dataTableKeys.detail(organizationId, tableId),
        })
      : Promise.resolve();
  const refreshAll = async () => {
    await Promise.all([refreshList(), refreshDetail()]);
  };

  return {
    createTable: useMutation({
      mutationFn: createDataTable,
      onSuccess: refreshList,
    }),
    updateTable: useMutation({
      mutationFn: updateDataTable,
      onSuccess: refreshAll,
    }),
    deleteTable: useMutation({
      mutationFn: deleteDataTable,
      onSuccess: refreshList,
    }),
    createField: useMutation({
      mutationFn: createDataTableField,
      onSuccess: refreshDetail,
    }),
    updateField: useMutation({
      mutationFn: updateDataTableField,
      onSuccess: refreshDetail,
    }),
    deleteField: useMutation({
      mutationFn: deleteDataTableField,
      onSuccess: refreshDetail,
    }),
    createRow: useMutation({
      mutationFn: createDataTableRow,
      onSuccess: refreshDetail,
    }),
    deleteRow: useMutation({
      mutationFn: deleteDataTableRow,
      onSuccess: refreshDetail,
    }),
    upsertCell: useMutation({
      mutationFn: upsertDataTableCell,
      onSuccess: refreshDetail,
    }),
  };
}
