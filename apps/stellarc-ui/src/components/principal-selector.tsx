import { Check, ChevronsUpDown, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";

// KFL-160: agents are member-like principals that must stay distinguishable
// from humans downstream (the assignee picker groups them separately).
export type PrincipalKind = "member" | "agent" | "team";

export type PrincipalOption = {
  id: string;
  kind: PrincipalKind;
  name: string;
  detail?: string;
  disabled?: boolean;
};

type PrincipalSelectorProps = {
  options: PrincipalOption[];
  value: PrincipalOption[];
  onValueChange: (value: PrincipalOption[]) => void;
  multiple?: boolean;
  kinds?: PrincipalKind[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyMessage?: string;
  "aria-label"?: string;
  className?: string;
};

const optionKey = (option: PrincipalOption) => `${option.kind}:${option.id}`;

export function PrincipalSelector({
  options,
  value,
  onValueChange,
  multiple = false,
  kinds = ["member", "team"],
  loading = false,
  disabled = false,
  placeholder = "Select members or teams",
  searchPlaceholder = "Search members and teams…",
  searchAriaLabel,
  emptyMessage = "No matching members or teams.",
  "aria-label": ariaLabel = "Select members or teams",
  className,
}: PrincipalSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerHeight, setTriggerHeight] = useState(0);
  const selectedKeys = useMemo(() => new Set(value.map(optionKey)), [value]);
  const resolvedSearchAriaLabel =
    searchAriaLabel ??
    (kinds.length === 1
      ? `Search ${kinds[0] === "member" ? "members" : "teams"}`
      : "Search members and teams");
  const visibleOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return options.filter(
      (option) =>
        kinds.includes(option.kind) &&
        (!query ||
          `${option.name} ${option.detail ?? ""} ${option.kind}`
            .toLocaleLowerCase()
            .includes(query)),
    );
  }, [kinds, options, search]);

  useEffect(() => {
    if (!open) return;
    setTriggerHeight(triggerRef.current?.getBoundingClientRect().height ?? 0);
    setSearch("");
    setActiveIndex(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const select = (option: PrincipalOption) => {
    if (option.disabled) return;
    const key = optionKey(option);
    if (multiple) {
      onValueChange(
        selectedKeys.has(key)
          ? value.filter((selected) => optionKey(selected) !== key)
          : [...value, option],
      );
      requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    onValueChange([option]);
    setOpen(false);
  };

  const summary = multiple
    ? value.length === 0
      ? placeholder
      : value.length === 1
        ? value[0]?.name
        : `${value.length} principals selected`
    : value[0]?.name || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          ref={triggerRef}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn("min-w-0 justify-between", className)}
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          <span
            className={cn(
              "truncate",
              value.length === 0 && "text-muted-foreground",
            )}
          >
            {summary}
          </span>
          <ChevronsUpDown className="ml-auto shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-(--anchor-width) p-0"
        sideOffset={0}
        style={{ marginTop: -triggerHeight }}
      >
        <div className="relative border-b border-border">
          <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            aria-label={resolvedSearchAriaLabel}
            className="rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
            disabled={disabled}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, visibleOptions.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const option = visibleOptions[activeIndex];
                if (option) select(option);
              }
            }}
            placeholder={searchPlaceholder}
            role="searchbox"
            value={search}
          />
        </div>
        <div
          aria-busy={loading}
          aria-label="Principal results"
          className="max-h-64 overflow-y-auto p-1"
          role="listbox"
          aria-multiselectable={multiple || undefined}
        >
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading members and teams…
            </p>
          ) : visibleOptions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
              <UsersRound className="size-5" />
              {emptyMessage}
            </div>
          ) : (
            visibleOptions.map((option, index) => {
              const selected = selectedKeys.has(optionKey(option));
              return (
                <button
                  key={optionKey(option)}
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50",
                    index === activeIndex && "bg-accent",
                  )}
                  disabled={option.disabled}
                  onClick={() => select(option)}
                  onMouseMove={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <Check
                    className={cn("size-4 shrink-0", !selected && "invisible")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {option.name}
                    </span>
                    {option.detail ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.detail}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { optionKey as principalOptionKey };
