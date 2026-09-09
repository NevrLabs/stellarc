import { useNavigate, useParams } from "@tanstack/react-router";
import { AlertCircle, Plus, Table2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import CreateDataTableModal from "./shared/modals/create-data-table-modal";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

export function NavTables() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { tableId: currentTableId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { canCreateBoards } = useOrganizationPermission();
  const [createOpen, setCreateOpen] = useState(false);
  const tablesEnabled = Boolean(
    (
      organization as
        | (typeof organization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const {
    data: tables = [],
    isLoading,
    isError,
    refetch,
  } = useDataTables(organization?.id ?? "", tablesEnabled);

  if (!organization || !tablesEnabled) return null;

  return (
    <>
      <SidebarGroup className="group/tables gap-1 p-2 pt-1 group-data-[collapsible=icon]:hidden">
        <div className="relative flex items-center">
          <SidebarGroupLabel className="h-7 flex-1 px-0 text-sidebar-accent-foreground">
            {t("navigation:tables.title")}
            <span className="ml-2 rounded-full border border-sidebar-border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
              Alpha
            </span>
          </SidebarGroupLabel>
          {canCreateBoards() && (
            <button
              type="button"
              aria-label={t("navigation:tables.create")}
              className="absolute right-0 flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 group-focus-within/tables:opacity-100 group-hover/tables:opacity-100"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {isLoading && (
              <div
                className="space-y-1 px-2 py-1"
                aria-label={t("navigation:tables.loading")}
                role="status"
              >
                <div className="h-7 animate-pulse rounded-md bg-sidebar-accent/60" />
                <div className="h-7 w-4/5 animate-pulse rounded-md bg-sidebar-accent/40" />
              </div>
            )}
            {isError && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-destructive hover:bg-sidebar-accent"
                onClick={() => refetch()}
              >
                <AlertCircle className="size-3.5" />
                {t("navigation:tables.loadError")}{" "}
                {t("navigation:tables.retry")}
              </button>
            )}
            {!isLoading && !isError && tables.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {t("navigation:tables.noTables")}
              </p>
            )}
            {tables.map((table) => (
              <SidebarMenuItem key={table.id}>
                <SidebarMenuButton
                  isActive={currentTableId === table.id}
                  className="h-8 gap-2 ps-3.5 text-sm data-[active=true]:bg-sidebar-accent"
                  tooltip={table.name}
                  onClick={() =>
                    navigate({
                      to: "/dashboard/organization/$organizationSlug/table/$tableId",
                      params: {
                        organizationSlug: organization.id,
                        tableId: table.id,
                      },
                    })
                  }
                >
                  <Table2 className="size-4 text-sidebar-foreground/70" />
                  <span className="truncate">{table.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <CreateDataTableModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        organizationId={organization.id}
      />
    </>
  );
}
