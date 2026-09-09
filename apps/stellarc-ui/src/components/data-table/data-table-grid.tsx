import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { useDataTableMutations } from "@/hooks/data-table/use-data-tables";
import { toast } from "@/lib/toast";
import type { DataTable, DataTableField } from "@/types/data-table";

type Props = {
  table: DataTable;
  organizationId: string;
  canEdit: boolean;
};

function FieldHeader({
  field,
  tableId,
  organizationId,
  canEdit,
}: {
  field: DataTableField;
  tableId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(field.name);
  const { updateField, deleteField } = useDataTableMutations(
    organizationId,
    tableId,
  );
  useEffect(() => setName(field.name), [field.name]);
  const save = async () => {
    const next = name.trim();
    if (!next || next === field.name) return setName(field.name);
    try {
      await updateField.mutateAsync({
        organizationId,
        tableId,
        fieldId: field.id,
        name: next,
      });
    } catch {
      setName(field.name);
      toast.error(t("navigation:tables.renameFieldError"));
    }
  };
  return (
    <div className="flex w-52 items-center gap-1 px-3">
      <Input
        unstyled
        value={name}
        disabled={!canEdit}
        aria-label={`Field ${field.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setName(field.name);
            e.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 [&_[data-slot=input]]:h-9 [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:font-medium"
      />
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Field options for ${field.name}`}
                className="rounded p-1 text-muted-foreground hover:bg-accent"
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
                  !window.confirm(
                    t("navigation:tables.deleteFieldConfirm", {
                      name: field.name,
                    }),
                  )
                )
                  return;
                try {
                  await deleteField.mutateAsync({
                    organizationId,
                    tableId,
                    fieldId: field.id,
                  });
                } catch {
                  toast.error(t("navigation:tables.deleteFieldError"));
                }
              }}
            >
              <Trash2 /> {t("navigation:tables.deleteField")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function DataTableGrid({ table, organizationId, canEdit }: Props) {
  const { t } = useTranslation();
  const [newFieldName, setNewFieldName] = useState("");
  const { createField, createRow, deleteRow, upsertCell } =
    useDataTableMutations(organizationId, table.id);
  const fields = [...table.fields].sort((a, b) => a.position - b.position);
  const rows = [...table.rows].sort((a, b) => a.position - b.position);
  const addField = async () => {
    const name = newFieldName.trim();
    if (!name) return;
    try {
      await createField.mutateAsync({
        organizationId,
        tableId: table.id,
        name,
      });
      setNewFieldName("");
    } catch {
      toast.error(t("navigation:tables.addFieldError"));
    }
  };
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="sticky top-0 z-10 flex h-11 border-b bg-muted/80 backdrop-blur">
            <div className="sticky left-0 z-20 flex w-12 items-center justify-center border-r bg-muted text-xs text-muted-foreground">
              #
            </div>
            {fields.map((field) => (
              <div key={field.id} className="border-r">
                <FieldHeader
                  field={field}
                  tableId={table.id}
                  organizationId={organizationId}
                  canEdit={canEdit}
                />
              </div>
            ))}
          </div>
          {rows.length === 0 && fields.length > 0 && (
            <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
              {t("navigation:tables.noRows")}
            </div>
          )}
          {rows.map((row, rowIndex) => (
            <div
              key={row.id}
              className="group flex h-11 border-b last:border-b-0 hover:bg-muted/30"
            >
              <div className="sticky left-0 z-5 flex w-12 items-center justify-center border-r bg-card text-xs text-muted-foreground group-hover:bg-muted/30">
                <span className="group-hover:hidden">{rowIndex + 1}</span>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Delete row ${rowIndex + 1}`}
                    className="hidden rounded p-1 text-destructive hover:bg-destructive/10 group-hover:block"
                    onClick={async () => {
                      try {
                        await deleteRow.mutateAsync({
                          organizationId,
                          tableId: table.id,
                          rowId: row.id,
                        });
                      } catch {
                        toast.error(t("navigation:tables.deleteRowError"));
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              {fields.map((field) => {
                const value =
                  row.cells.find((cell) => cell.fieldId === field.id)?.value ??
                  "";
                return (
                  <div key={field.id} className="w-52 border-r">
                    <input
                      defaultValue={value}
                      key={`${row.id}-${field.id}-${value}`}
                      disabled={!canEdit}
                      aria-label={`${field.name}, row ${rowIndex + 1}`}
                      className="h-full w-full bg-transparent px-3 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-inset focus:ring-primary/40 disabled:cursor-default"
                      onBlur={async (e) => {
                        if (e.target.value === value) return;
                        try {
                          await upsertCell.mutateAsync({
                            organizationId,
                            tableId: table.id,
                            rowId: row.id,
                            fieldId: field.id,
                            value: e.target.value,
                          });
                        } catch {
                          e.target.value = value;
                          toast.error(t("navigation:tables.saveCellError"));
                        }
                      }}
                    />{" "}
                  </div>
                );
              })}
            </div>
          ))}
          {canEdit && fields.length > 0 && (
            <div className="flex h-11 items-center gap-2 border-b bg-muted/10 px-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={createRow.isPending}
                onClick={async () => {
                  try {
                    await createRow.mutateAsync({
                      organizationId,
                      tableId: table.id,
                    });
                  } catch {
                    toast.error(t("navigation:tables.addRowError"));
                  }
                }}
              >
                <Plus className="size-4" /> {t("navigation:tables.addRow")}
              </Button>
              <form
                className="flex w-52 items-center gap-1 rounded-md px-2 transition-colors focus-within:bg-background hover:bg-muted/50"
                onSubmit={(e) => {
                  e.preventDefault();
                  addField();
                }}
              >
                <Plus className="size-4 text-muted-foreground" />
                <Input
                  unstyled
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder={t("navigation:tables.addField")}
                  aria-label={t("navigation:tables.newFieldName")}
                  className="[&_[data-slot=input]]:h-8 [&_[data-slot=input]]:px-0"
                />
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
