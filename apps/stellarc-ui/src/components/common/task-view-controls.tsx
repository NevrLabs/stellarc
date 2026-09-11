import { ArrowDownAZ, ArrowUpAZ, Columns3, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type {
  DisplayConfig,
  GroupField,
  SortConfig,
  SortField,
} from "@/lib/sort-tasks";

function CheckSlot({ checked }: { checked: boolean }) {
  return (
    <span
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      }`}
    >
      {checked ? "\u2713" : null}
    </span>
  );
}

type TaskViewControlsProps = {
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  group: GroupField;
  onGroupChange: (group: GroupField) => void;
  display: DisplayConfig;
  onDisplayChange: (display: DisplayConfig) => void;
};

export default function TaskViewControls({
  sort,
  onSortChange,
  group,
  onGroupChange,
  display,
  onDisplayChange,
}: TaskViewControlsProps) {
  const { t } = useTranslation();

  const sortFields: { field: SortField; label: string }[] = [
    { field: "position", label: t("tasks:sort.fields.position") },
    { field: "createdAt", label: t("tasks:sort.fields.createdAt") },
    { field: "priority", label: t("tasks:sort.fields.priority") },
    { field: "dueDate", label: t("tasks:sort.fields.dueDate") },
    { field: "title", label: t("tasks:sort.fields.title") },
    { field: "number", label: t("tasks:sort.fields.number") },
  ];

  const groupFields: { field: GroupField; label: string }[] = [
    { field: "none", label: t("tasks:group.none") },
    { field: "status", label: t("tasks:group.status") },
    { field: "priority", label: t("tasks:group.priority") },
    { field: "assignee", label: t("tasks:group.assignee") },
  ];

  const displayFields: { field: keyof DisplayConfig; label: string }[] = [
    { field: "assignee", label: t("tasks:display.assignee") },
    { field: "priority", label: t("tasks:display.priority") },
    { field: "labels", label: t("tasks:display.labels") },
    { field: "dates", label: t("tasks:display.dates") },
  ];

  const handleSortFieldChange = (field: SortField) => {
    if (field === "position" || field === sort.field) {
      onSortChange({ field: "position", direction: "asc" });
    } else {
      const defaultDirection: SortConfig["direction"] =
        field === "priority" ? "desc" : "asc";
      onSortChange({ field, direction: defaultDirection });
    }
  };

  const toggleSortDirection = () => {
    onSortChange({
      ...sort,
      direction: sort.direction === "asc" ? "desc" : "asc",
    });
  };

  const toggleDisplay = (field: keyof DisplayConfig) => {
    onDisplayChange({ ...display, [field]: !display[field] });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium outline-none ring-0 ${
                sort.field !== "position"
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-foreground hover:bg-accent/60"
              }`}
            />
          }
        >
          {sort.direction === "asc" ? (
            <ArrowUpAZ className="h-3 w-3" />
          ) : (
            <ArrowDownAZ className="h-3 w-3" />
          )}
          {sort.field !== "position"
            ? sortFields.find((f) => f.field === sort.field)?.label
            : t("tasks:sort.label")}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
              {t("tasks:sort.by")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sortFields.map(({ field, label }) => (
              <DropdownMenuItem
                key={field}
                onClick={() => handleSortFieldChange(field)}
                className="h-8 rounded-md text-sm"
              >
                <CheckSlot checked={sort.field === field} />
                {label}
              </DropdownMenuItem>
            ))}
            {sort.field !== "position" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onSortChange({ ...sort, direction: "asc" })}
                  className="h-8 rounded-md text-sm"
                >
                  <CheckSlot checked={sort.direction === "asc"} />
                  {t("tasks:sort.ascending")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onSortChange({ ...sort, direction: "desc" })}
                  className="h-8 rounded-md text-sm"
                >
                  <CheckSlot checked={sort.direction === "desc"} />
                  {t("tasks:sort.descending")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Group */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium outline-none ring-0 ${
                group !== "none"
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-foreground hover:bg-accent/60"
              }`}
            />
          }
        >
          <Columns3 className="h-3 w-3" />
          {group !== "none"
            ? groupFields.find((g) => g.field === group)?.label
            : t("tasks:group.label")}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
              {t("tasks:group.by")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {groupFields.map(({ field, label }) => (
              <DropdownMenuItem
                key={field}
                onClick={() => onGroupChange(field)}
                className="h-8 rounded-md text-sm"
              >
                <CheckSlot checked={group === field} />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Display toggles */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground outline-none ring-0 hover:bg-accent/60"
            />
          }
        >
          <Eye className="h-3 w-3" />
          {t("tasks:display.label")}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
              {t("tasks:display.show")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {displayFields.map(({ field, label }) => (
              <DropdownMenuItem
                key={field}
                onClick={() => toggleDisplay(field)}
                className="h-8 rounded-md text-sm"
              >
                <CheckSlot checked={display[field]} />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort direction toggle */}
      {sort.field !== "position" && (
        <button
          type="button"
          onClick={toggleSortDirection}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent/60"
        >
          {sort.direction === "asc" ? (
            <ArrowUpAZ className="h-3 w-3" />
          ) : (
            <ArrowDownAZ className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}
