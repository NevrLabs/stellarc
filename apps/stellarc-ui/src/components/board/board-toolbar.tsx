import { Filter, Search, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import BoardViewOptions from "@/components/board/board-view-options";
import SortControl from "@/components/common/sort-control";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { resolveLabelColor } from "@/constants/label-colors";
import {
  type BoardFilters,
  DUE_DATE_FILTER_VALUES,
} from "@/hooks/use-task-filters";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import type { SortConfig } from "@/lib/sort-tasks";
import type { BoardWithTasks } from "@/types/board";

type OrganizationLabel = {
  id: string;
  name: string;
  color: string;
};

type ActiveUsers = {
  members?: Array<{
    userId: string;
    user?: {
      image?: string | null;
      name?: string | null;
    } | null;
  }>;
};

type BoardToolbarProps = {
  board?: BoardWithTasks | null;
  filters: BoardFilters;
  updateFilter: (
    key: keyof BoardFilters,
    value: BoardFilters[keyof BoardFilters],
  ) => void;
  updateLabelFilter: (labelId: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  users?: ActiveUsers;
  organizationLabels: OrganizationLabel[];
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  /**
   * Board search + view options live in this toolbar (#61 rework): the user
   * rejected having them stranded up in the page header, away from Filter and
   * Sort. Timeline keeps every view control on one row; so does this.
   */
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef?: Ref<HTMLInputElement>;
  groupBy: BoardGroupBy;
  onGroupByChange: (groupBy: BoardGroupBy) => void;
  /**
   * Rendered immediately after the search field. List view uses it for the
   * "Ctrl + drag to nest" hint, which previously sat in a second toolbar row
   * below this one.
   */
  searchAdornment?: ReactNode;
  /**
   * Rendered immediately before `actions` (i.e. left of Create ticket). List
   * view uses it for Bulk Actions, previously in that same second row.
   */
  secondaryActions?: ReactNode;
  filtersOnly?: boolean;
  actions?: ReactNode;
};

function CheckSlot({ checked }: { checked: boolean }) {
  return (
    <span
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      }`}
    >
      {checked ? "✓" : null}
    </span>
  );
}

type ActiveFilterChipProps = {
  subject: string;
  operator: string;
  value: ReactNode;
  onClear: () => void;
};

function ActiveFilterChip({
  subject,
  operator,
  value,
  onClear,
}: ActiveFilterChipProps) {
  return (
    <div className="inline-flex h-7 items-center rounded-md border border-border bg-background text-xs shadow-xs">
      <span className="px-2 font-medium text-foreground">{subject}</span>
      <span className="h-full w-px bg-border" />
      <span className="px-2 text-foreground/80">{operator}</span>
      <span className="h-full w-px bg-border" />
      <span className="flex px-2 text-foreground">{value}</span>
      <span className="h-full w-px bg-border" />
      <button
        className="inline-flex h-full w-7 items-center justify-center rounded-r-md text-foreground/70 hover:bg-accent/70 hover:text-foreground"
        onClick={onClear}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StackedIcons({
  items,
  itemClassName,
}: {
  items: Array<{ id: string; node: ReactNode }>;
  itemClassName?: string;
}) {
  if (items.length === 0) return null;

  return (
    <span className="inline-flex items-center -space-x-1.5">
      {items.slice(0, 3).map((item) => (
        <span
          key={item.id}
          className={`inline-flex size-4 items-center justify-center rounded-full bg-background ${itemClassName ?? ""}`}
        >
          {item.node}
        </span>
      ))}
    </span>
  );
}

export default function BoardToolbar({
  board,
  filters,
  updateFilter,
  updateLabelFilter,
  clearFilters,
  hasActiveFilters,
  users,
  organizationLabels,
  sort,
  onSortChange,
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  groupBy,
  onGroupByChange,
  searchAdornment,
  secondaryActions,
  filtersOnly = false,
  actions,
}: BoardToolbarProps) {
  const { t } = useTranslation();
  const selectedStatusIds = filters.status ?? [];
  const selectedPriorityIds = filters.priority ?? [];
  const selectedAssigneeIds = filters.assignee ?? [];
  const selectedDueDateFilters = filters.dueDate ?? [];

  const getStatusDisplayName = (statusId: string) => {
    const column = board?.columns?.find((col) => col.id === statusId);
    return column?.name || statusId;
  };
  const getStatusIcon = (statusId: string) => {
    const column = board?.columns?.find((col) => col.id === statusId);
    return getColumnIcon(statusId, column?.isFinal, column?.icon);
  };

  const getPriorityDisplayName = (priority: string) =>
    getPriorityLabel(priority);

  const getAssigneeDisplayName = (userId: string) => {
    const member = users?.members?.find((m) => m.userId === userId);
    return member?.user?.name || t("common:people.unknown");
  };
  const getAssigneeAvatar = (userId: string) => {
    const member = users?.members?.find((m) => m.userId === userId);
    return (
      <Avatar
        className={`h-4 w-4 ${getAvatarTone(userId, member?.user?.email)}`}
      >
        <AvatarImage
          src={member?.user?.image ?? ""}
          alt={member?.user?.name || ""}
        />
        <AvatarFallback className="bg-transparent border border-border/30 text-[9px] font-medium">
          {getInitials(member?.user?.name)}
        </AvatarFallback>
      </Avatar>
    );
  };

  const uniqueLabels = organizationLabels.reduce(
    (acc: OrganizationLabel[], label: OrganizationLabel) => {
      const existing = acc.find(
        (l) => l.name === label.name && l.color === label.color,
      );
      if (!existing) acc.push(label);
      return acc;
    },
    [],
  );

  const isLabelGroupSelected = (label: { name: string; color: string }) => {
    return organizationLabels
      .filter((l) => l.name === label.name && l.color === label.color)
      .some((l) => filters.labels?.includes(l.id));
  };

  const toggleStatusFilter = (statusId: string) => {
    const exists = selectedStatusIds.includes(statusId);
    const next = exists
      ? selectedStatusIds.filter((id) => id !== statusId)
      : [...selectedStatusIds, statusId];
    updateFilter("status", next.length > 0 ? next : null);
  };

  const togglePriorityFilter = (priority: string) => {
    const exists = selectedPriorityIds.includes(priority);
    const next = exists
      ? selectedPriorityIds.filter((id) => id !== priority)
      : [...selectedPriorityIds, priority];
    updateFilter("priority", next.length > 0 ? next : null);
  };

  const toggleAssigneeFilter = (userId: string) => {
    const exists = selectedAssigneeIds.includes(userId);
    const next = exists
      ? selectedAssigneeIds.filter((id) => id !== userId)
      : [...selectedAssigneeIds, userId];
    updateFilter("assignee", next.length > 0 ? next : null);
  };

  const toggleDueDateFilter = (dueDate: string) => {
    const exists = selectedDueDateFilters.includes(dueDate);
    const next = exists
      ? selectedDueDateFilters.filter((id) => id !== dueDate)
      : [...selectedDueDateFilters, dueDate];
    updateFilter("dueDate", next.length > 0 ? next : null);
  };

  const toggleLabelGroup = (label: { name: string; color: string }) => {
    const matching = organizationLabels.filter(
      (l) => l.name === label.name && l.color === label.color,
    );
    const anySelected = matching.some((l) => filters.labels?.includes(l.id));

    for (const l of matching) {
      if (
        (anySelected && filters.labels?.includes(l.id)) ||
        (!anySelected && !filters.labels?.includes(l.id))
      ) {
        updateLabelFilter(l.id);
      }
    }
  };

  const clearLabelFilters = () => {
    if (!filters.labels || filters.labels.length === 0) return;
    for (const labelId of filters.labels) updateLabelFilter(labelId);
  };

  return (
    <div
      className={
        filtersOnly
          ? "min-w-0"
          : "border-border/80 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70"
      }
      data-testid={filtersOnly ? "board-filter-controls" : "board-toolbar"}
    >
      <div
        className={
          filtersOnly
            ? "flex min-w-0 items-center"
            : "flex min-h-10 items-center px-2 py-1.5 md:px-3"
        }
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-foreground text-xs font-medium outline-none ring-0 hover:bg-accent/60"
                  />
                }
              >
                <Filter className="h-3 w-3" />
                {t("common:actions.filter")}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="max-h-[min(28rem,calc(100vh-6rem))] w-56 overflow-y-auto"
                align="start"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                    {t("tasks:boardFilters.filterBy")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 rounded-md text-sm">
                    {t("tasks:boardFilters.subjects.status")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                          selectedStatusIds.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("status", null)}
                        type="button"
                      >
                        <CheckSlot checked={selectedStatusIds.length === 0} />
                        {t("tasks:boardFilters.allStatuses")}
                      </button>
                      {board?.columns?.map((column) => (
                        <button
                          key={column.id}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                            selectedStatusIds.includes(column.id)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => toggleStatusFilter(column.id)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedStatusIds.includes(column.id)}
                          />
                          <span className="inline-flex h-4 w-4 items-center justify-center">
                            {getStatusIcon(column.id)}
                          </span>
                          <span className="truncate">{column.name}</span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 rounded-md text-sm">
                    {t("tasks:boardFilters.subjects.priority")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                          selectedPriorityIds.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("priority", null)}
                        type="button"
                      >
                        <CheckSlot checked={selectedPriorityIds.length === 0} />
                        {t("tasks:boardFilters.allPriorities")}
                      </button>
                      {["urgent", "high", "medium", "low"].map((priority) => (
                        <button
                          key={priority}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                            selectedPriorityIds.includes(priority)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => togglePriorityFilter(priority)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedPriorityIds.includes(priority)}
                          />
                          <span className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                            {getPriorityIcon(priority)}
                          </span>
                          <span className="truncate capitalize">
                            {getPriorityDisplayName(priority)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 rounded-md text-sm">
                    {t("tasks:boardFilters.subjects.assignee")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                          selectedAssigneeIds.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("assignee", null)}
                        type="button"
                      >
                        <CheckSlot checked={selectedAssigneeIds.length === 0} />
                        {t("tasks:boardFilters.allAssignees")}
                      </button>
                      {users?.members?.map((member) => (
                        <button
                          key={member.userId}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                            selectedAssigneeIds.includes(member.userId)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => toggleAssigneeFilter(member.userId)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedAssigneeIds.includes(
                              member.userId,
                            )}
                          />
                          <span className="inline-flex items-center gap-2">
                            <Avatar
                              className={`h-5 w-5 ${getAvatarTone(member.userId, member.user?.email)}`}
                            >
                              <AvatarImage
                                src={member.user?.image ?? ""}
                                alt={member.user?.name || ""}
                              />
                              <AvatarFallback className="bg-transparent border border-border/30 text-[10px] font-medium">
                                {getInitials(member.user?.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span>{member.user?.name}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 rounded-md text-sm">
                    {t("tasks:boardFilters.subjects.dueDate")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                          selectedDueDateFilters.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("dueDate", null)}
                        type="button"
                      >
                        <CheckSlot
                          checked={selectedDueDateFilters.length === 0}
                        />
                        {t("tasks:boardFilters.allDueDates")}
                      </button>
                      {[
                        DUE_DATE_FILTER_VALUES.dueThisWeek,
                        DUE_DATE_FILTER_VALUES.dueNextWeek,
                        DUE_DATE_FILTER_VALUES.noDueDate,
                      ].map((dueDate) => (
                        <button
                          key={dueDate}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs ${
                            selectedDueDateFilters.includes(dueDate)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/90 hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => toggleDueDateFilter(dueDate)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedDueDateFilters.includes(dueDate)}
                          />
                          {t(
                            `tasks:backlog.filters.${
                              dueDate === DUE_DATE_FILTER_VALUES.dueThisWeek
                                ? "dueThisWeek"
                                : dueDate === DUE_DATE_FILTER_VALUES.dueNextWeek
                                  ? "dueNextWeek"
                                  : "noDueDate"
                            }`,
                          )}
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 rounded-md text-sm">
                    {t("tasks:properties.labels")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <DropdownMenuItem
                      onClick={clearLabelFilters}
                      className="h-8 rounded-md text-sm"
                    >
                      <CheckSlot
                        checked={!filters.labels || filters.labels.length === 0}
                      />
                      {t("tasks:boardFilters.allLabels")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {uniqueLabels.length > 0 ? (
                      uniqueLabels.map((label) => (
                        <DropdownMenuItem
                          key={label.id}
                          onClick={() => toggleLabelGroup(label)}
                          className="h-8 rounded-md text-sm"
                        >
                          <CheckSlot checked={isLabelGroupSelected(label)} />
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: resolveLabelColor(label.color),
                            }}
                          />
                          <span className="max-w-20 truncate">
                            {label.name}
                          </span>
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem
                        disabled
                        className="h-8 rounded-md text-sm text-muted-foreground"
                      >
                        {t("tasks:labels.empty")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {hasActiveFilters && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={clearFilters}
                      className="h-8 rounded-md text-sm text-muted-foreground"
                    >
                      {t("common:actions.clearAllFilters")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {!filtersOnly && (
              <SortControl sort={sort} onSortChange={onSortChange} />
            )}
            {!filtersOnly && (
              <BoardViewOptions
                groupBy={groupBy}
                onGroupByChange={onGroupByChange}
              />
            )}

            {!filtersOnly && (
              <div className="relative w-[200px]">
                <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder={t("tasks:boardSearchPlaceholder")}
                  aria-label={t("tasks:boardSearchPlaceholder")}
                  className="h-7 [&_[data-slot=input]]:h-7 [&_[data-slot=input]]:leading-7 [&_[data-slot=input]]:pl-8 [&_[data-slot=input]]:pr-7 [&_[data-slot=input]]:text-xs [&_[data-slot=input]]:placeholder:text-xs"
                />
                {searchQuery ? (
                  <button
                    aria-label={t("tasks:boardClearSearch")}
                    className="-translate-y-1/2 absolute top-1/2 right-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => onSearchQueryChange("")}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            )}

            {!filtersOnly && searchAdornment ? (
              <div
                className="shrink-0"
                data-testid="board-toolbar-search-adornment"
              >
                {searchAdornment}
              </div>
            ) : null}

            {selectedStatusIds.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.status")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StackedIcons
                      items={selectedStatusIds.map((statusId) => ({
                        id: statusId,
                        node: getStatusIcon(statusId),
                      }))}
                      itemClassName="[&>svg]:h-3.5 [&>svg]:w-3.5"
                    />
                    <span>
                      {selectedStatusIds.length === 1
                        ? getStatusDisplayName(selectedStatusIds[0])
                        : t("tasks:boardFilters.selectedCount", {
                            count: selectedStatusIds.length,
                          })}
                    </span>
                  </span>
                }
                onClear={() => updateFilter("status", null)}
              />
            )}

            {selectedPriorityIds.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.priority")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StackedIcons
                      items={selectedPriorityIds.map((priority) => ({
                        id: priority,
                        node: getPriorityIcon(priority),
                      }))}
                    />
                    <span>
                      {selectedPriorityIds.length === 1
                        ? getPriorityDisplayName(selectedPriorityIds[0])
                        : t("tasks:boardFilters.selectedCount", {
                            count: selectedPriorityIds.length,
                          })}
                    </span>
                  </span>
                }
                onClear={() => updateFilter("priority", null)}
              />
            )}

            {selectedAssigneeIds.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.assignee")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StackedIcons
                      items={selectedAssigneeIds.map((userId) => ({
                        id: userId,
                        node: getAssigneeAvatar(userId),
                      }))}
                    />
                    <span>
                      {selectedAssigneeIds.length === 1
                        ? getAssigneeDisplayName(selectedAssigneeIds[0])
                        : t("tasks:boardFilters.selectedCount", {
                            count: selectedAssigneeIds.length,
                          })}
                    </span>
                  </span>
                }
                onClear={() => updateFilter("assignee", null)}
              />
            )}

            {selectedDueDateFilters.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.dueDate")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  selectedDueDateFilters.length === 1
                    ? t(
                        `tasks:backlog.filters.${
                          selectedDueDateFilters[0] ===
                          DUE_DATE_FILTER_VALUES.dueThisWeek
                            ? "dueThisWeek"
                            : selectedDueDateFilters[0] ===
                                DUE_DATE_FILTER_VALUES.dueNextWeek
                              ? "dueNextWeek"
                              : "noDueDate"
                        }`,
                      )
                    : t("tasks:boardFilters.selectedCount", {
                        count: selectedDueDateFilters.length,
                      })
                }
                onClear={() => updateFilter("dueDate", null)}
              />
            )}

            {filters.labels && filters.labels.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.labels")}
                operator={t("tasks:boardFilters.operators.includeAnyOf")}
                value={t("tasks:boardFilters.selectedCount", {
                  count: filters.labels.length,
                })}
                onClear={clearLabelFilters}
              />
            )}
          </div>

          {!filtersOnly && (secondaryActions || actions) ? (
            <div
              className="flex shrink-0 items-center gap-2"
              data-testid="board-toolbar-actions"
            >
              {secondaryActions}
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
