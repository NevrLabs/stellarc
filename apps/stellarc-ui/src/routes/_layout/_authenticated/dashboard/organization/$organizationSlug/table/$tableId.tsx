import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, MoreHorizontal, Table2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTableGrid } from "@/components/data-table/data-table-grid";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  useDataTable,
  useDataTableMutations,
} from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/table/$tableId",
)({ component: DataTableRoute });

function DataTableRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationSlug, tableId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const {
    data: table,
    isLoading,
    isError,
    refetch,
  } = useDataTable(organizationId, tableId);
  const { canUpdateBoards } = useOrganizationPermission();
  const canEdit = canUpdateBoards();
  const { updateTable, deleteTable } = useDataTableMutations(
    organizationId,
    tableId,
  );
  const [name, setName] = useState("");
  useEffect(() => setName(table?.name ?? ""), [table?.name]);

  const saveName = async () => {
    const next = name.trim();
    if (!table || !next || next === table.name) {
      setName(table?.name ?? "");
      return;
    }
    try {
      await updateTable.mutateAsync({ organizationId, tableId, name: next });
    } catch {
      setName(table.name);
      toast.error(t("navigation:tables.renameTableError"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-5 p-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    );
  }
  if (isError || !table) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border bg-card p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-3 size-8 text-destructive" />
          <h1 className="font-semibold">
            {t("navigation:tables.loadTableError")}
          </h1>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {t("navigation:tables.connectionHelp")}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            {t("navigation:tables.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-4 sm:p-6">
      <PageTitle title={table.name} hideAppName />
      <header className="flex shrink-0 items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Table2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            unstyled
            value={name}
            disabled={!canEdit}
            aria-label={t("navigation:tables.tableName")}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName(table.name);
                e.currentTarget.blur();
              }
            }}
            className="max-w-xl [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:text-2xl [&_[data-slot=input]]:font-semibold [&_[data-slot=input]]:tracking-tight"
          />
          <p className="text-sm text-muted-foreground">
            {t("navigation:tables.row", { count: table.rows.length })} ·{" "}
            {t("navigation:tables.field", { count: table.fields.length })}
          </p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("navigation:tables.tableOptions")}
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  if (
                    !window.confirm(t("navigation:tables.deleteTableConfirm"))
                  )
                    return;
                  try {
                    await deleteTable.mutateAsync({ organizationId, tableId });
                    toast.success(t("navigation:tables.deleted"));
                    navigate({
                      to: "/dashboard/organization/$organizationSlug",
                      params: { organizationSlug },
                    });
                  } catch {
                    toast.error(t("navigation:tables.deleteTableError"));
                  }
                }}
              >
                <Trash2 /> {t("navigation:tables.deleteTable")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      {table.fields.length === 0 && !canEdit ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <div>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Table2 className="size-6" />
            </div>
            <h2 className="font-semibold">{t("navigation:tables.empty")}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("navigation:tables.readOnlyEmpty")}
            </p>
          </div>
        </div>
      ) : (
        <DataTableGrid
          table={table}
          organizationId={organizationId}
          canEdit={canEdit}
        />
      )}
    </main>
  );
}
