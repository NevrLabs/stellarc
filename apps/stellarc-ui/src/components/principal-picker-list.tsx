import { Bot, Check, Search, Users } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export type PrincipalPickerKind = "user" | "agent" | "team";

export type PrincipalPickerOption = {
  type: PrincipalPickerKind;
  value: string;
  label: string;
  image?: string;
};

type PrincipalPickerListProps = {
  options: PrincipalPickerOption[];
  /** Currently selected option, or null/undefined when nothing is chosen. */
  selected?: { type: PrincipalPickerKind; value: string } | null;
  onSelect: (option?: PrincipalPickerOption) => void;
  loading?: boolean;
  /** Renders a leading "no selection" row (used by the assignee popover). */
  clearLabel?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyMessage?: string;
  memberLabel?: string;
  agentLabel?: string;
  teamLabel?: string;
  usersGroupLabel?: string;
  agentsGroupLabel?: string;
  teamsGroupLabel?: string;
};

/**
 * The compact member/agent/team picker body: a search box over grouped rows.
 *
 * #107: the flag dialog originally used the bulky `PrincipalSelector` combobox.
 * This is the assignment selector's list, extracted so both surfaces use one
 * control — "very compact and useful", and only one dropdown pattern to learn.
 *
 * KFL-160: rows are split into three labelled groups — Users / Agents / Teams —
 * because agent principals previously rendered identically to human members
 * (the kind label was a binary user/team ternary, so agents read "Member").
 * Empty groups drop their heading, including while searching.
 */
export function PrincipalPickerList({
  options,
  selected,
  onSelect,
  loading = false,
  clearLabel,
  searchPlaceholder = "Search people and teams",
  searchAriaLabel = "Search people and teams",
  emptyMessage = "No people or teams found",
  memberLabel = "Member",
  agentLabel = "Agent",
  teamLabel = "Team",
  usersGroupLabel = "Users",
  agentsGroupLabel = "Agents",
  teamsGroupLabel = "Teams",
}: PrincipalPickerListProps) {
  const [search, setSearch] = useState("");

  const visibleOptions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase().includes(needle),
    );
  }, [options, search]);

  const groups = useMemo(() => {
    const definitions: Array<{
      kind: PrincipalPickerKind;
      heading: string;
      rowLabel: string;
    }> = [
      { kind: "user", heading: usersGroupLabel, rowLabel: memberLabel },
      { kind: "agent", heading: agentsGroupLabel, rowLabel: agentLabel },
      { kind: "team", heading: teamsGroupLabel, rowLabel: teamLabel },
    ];

    return definitions
      .map((definition) => ({
        ...definition,
        items: visibleOptions.filter(
          (option) => option.type === definition.kind,
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [
    visibleOptions,
    usersGroupLabel,
    agentsGroupLabel,
    teamsGroupLabel,
    memberLabel,
    agentLabel,
    teamLabel,
  ]);

  /*
    Keyboard navigation moves over a FLAT row order, not per-group: group
    headings are presentational, so a keyboard user should never have to step
    over them. This flattening is what makes ArrowDown cross a group boundary
    in one press.
  */
  const flatRows = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  );

  const [activeIndex, setActiveIndex] = useState(-1);

  // A changed result set invalidates the old highlight position.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on result change
  useEffect(() => {
    setActiveIndex(-1);
  }, [search, options]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (flatRows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      // Clamp instead of wrapping: wrapping past the end silently teleports the
      // highlight to the top, which reads as a glitch in a short list.
      setActiveIndex((current) => Math.min(current + 1, flatRows.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const row = flatRows[activeIndex];
      if (row) onSelect(row);
    }
  };

  return (
    /*
      The handler sits on a wrapper in the CAPTURE phase, not just on the input:
      Base UI's Popover implements its own roving focus and consumes ArrowUp /
      ArrowDown at the container level, so a bubble-phase listener on the input
      never fires inside a popover. It passed in jsdom, which has no popover
      focus manager — a reminder that jsdom green is not browser green.
    */
    // biome-ignore lint/a11y/noStaticElementInteractions: routes keys to the list below
    <div onKeyDownCapture={handleKeyDown}>
      <div className="relative mb-1">
        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label={searchAriaLabel}
          className="h-8 pl-8"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          value={search}
        />
      </div>
      {/*
        #107: capped so the list scrolls instead of stretching its container.
        Sized for ~6 rows: tall enough to browse, short enough that a host with
        other controls (the flag popover stacks types, notes and actions around
        it) still fits on screen.
      */}
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {clearLabel ? (
          <Button
            className="w-full justify-start gap-2"
            onClick={() => onSelect()}
            size="sm"
            variant="ghost"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border">
              ?
            </span>
            {clearLabel}
            {!selected && <Check className="ml-auto h-4 w-4" />}
          </Button>
        ) : null}

        {loading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : (
          groups.map((group) => (
            /*
              KFL-160: a Fragment, not a wrapper element, so every row stays a
              direct child of the single bounded scroll container (#107).
            */
            <Fragment key={group.kind}>
              {/*
                KFL-160: a lightweight heading, not a separate container, so the
                compact row rhythm and the single scroll area are preserved.
              */}
              <p
                className="px-2 pt-1 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                data-testid={`principal-group-heading-${group.kind}`}
              >
                {group.heading}
              </p>
              {group.items.map((option) => {
                const isSelected =
                  selected?.type === option.type &&
                  selected?.value === option.value;
                const isActive =
                  activeIndex >= 0 && flatRows[activeIndex] === option;

                return (
                  <Button
                    className={cn(
                      "w-full justify-start gap-2",
                      isActive && "bg-accent text-accent-foreground",
                    )}
                    data-active={isActive ? "true" : undefined}
                    data-testid={`principal-option-${option.type}-${option.value}`}
                    key={`${option.type}:${option.value}`}
                    onClick={() => onSelect(option)}
                    size="sm"
                    variant="ghost"
                  >
                    {option.type === "team" ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Users className="h-4 w-4" />
                      </span>
                    ) : option.type === "agent" ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Bot className="h-4 w-4" />
                      </span>
                    ) : (
                      <Avatar
                        className={cn(
                          "h-6 w-6 shrink-0",
                          getAvatarTone(option.value),
                        )}
                      >
                        <AvatarImage alt={option.label} src={option.image} />
                        <AvatarFallback className="bg-transparent">
                          {getInitials(option.label)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span className="min-w-0 truncate">{option.label}</span>
                    {/*
                      #107: the principal kind is secondary information, so it
                      is pushed to the right edge instead of crowding the name
                      it follows. `ml-auto` on the kind means the check that
                      used to own that class now simply trails it.
                    */}
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-xs text-muted-foreground",
                      )}
                      data-testid="principal-option-kind"
                    >
                      {group.rowLabel}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                  </Button>
                );
              })}
            </Fragment>
          ))
        )}

        {!loading && visibleOptions.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

export default PrincipalPickerList;
