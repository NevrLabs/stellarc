import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The single view switcher for every surface (#board + #repo).
 *
 * Board views and repo views were two separate implementations that had visibly
 * drifted: repo views were an inline `<nav>` of route `<Link>`s with square
 * corners on `bg-background`, while board views used a Radix `Tabs` set with a
 * fully-rounded pill on `bg-muted/55`. Same control, two looks.
 *
 * They could not simply share a component because their navigation models
 * differ, and that difference is real rather than incidental:
 *   - repo views ARE routes — each tab navigates (`/repo/$repoId/issues`)
 *   - board views are STATE — `list` and `board` live on one route and differ by
 *     `viewMode`, so selecting a tab runs branching logic instead of navigating
 *
 * So this component takes the repo markup (the visual source of truth) and
 * accepts EITHER shape per item: pass `to` for a link tab, or omit it and
 * handle `onValueChange` for a state tab. One component, one look, neither
 * navigation model broken.
 */

type LinkProps = ComponentProps<typeof Link>;

export type ViewTabItem = {
  /** Stable identifier, also used as the React key and the change payload. */
  value: string;
  label: string;
  icon: ReactNode;
  /** Route to navigate to. Omit for state-driven tabs. */
  to?: LinkProps["to"];
  /** Route params, when `to` is set. */
  params?: LinkProps["params"];
};

type ViewTabsProps = {
  /** Currently active item's `value`. */
  value: string;
  items: ViewTabItem[];
  /** Required for state-driven tabs; ignored for items carrying `to`. */
  onValueChange?: (value: string) => void;
  "aria-label": string;
  className?: string;
};

/*
  Shared geometry. `h-8` (32px) holds a 24px tab plus the 2px of p-0.5 padding
  and 2px of border — 28px — so unlike the board tabs' former `h-8` + `p-1` +
  24px tab (34px) the content cannot overflow its own container and push the
  active pill out of alignment.
*/
const LIST_CLASS =
  "inline-flex h-8 min-w-0 items-center gap-0.5 overflow-hidden rounded-lg border border-border/80 bg-background p-0.5";

const TAB_BASE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium transition-colors sm:px-2";

const TAB_ACTIVE = "bg-secondary text-secondary-foreground";

const TAB_INACTIVE =
  "text-muted-foreground hover:bg-accent hover:text-accent-foreground";

export function ViewTabs({
  value,
  items,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: ViewTabsProps) {
  return (
    <div
      className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="view-tabs-scroller"
    >
      {/*
        Explicit tab semantics. The repo switcher this markup came from was a
        plain `<nav>` of links with no roles at all, so screen readers announced
        it as a list of links rather than a view switcher. The board switcher got
        these for free from Radix `Tabs`; keeping them here means unifying the
        two does not regress accessibility on the board side or leave the repo
        side unlabelled.
      */}
      <div
        aria-label={ariaLabel}
        className={cn(LIST_CLASS, className)}
        data-slot="tabs-list"
        data-testid="view-tabs"
        role="tablist"
      >
        {items.map((item) => {
          const isActive = item.value === value;
          const classes = cn(TAB_BASE, isActive ? TAB_ACTIVE : TAB_INACTIVE);
          // Constrained widths collapse the tabs to icons only.
          const content = (
            <>
              {item.icon}
              <span className="hidden 2xl:inline">{item.label}</span>
            </>
          );
          const shared = {
            "aria-selected": isActive,
            className: classes,
            "data-slot": "tab",
            "data-testid": `view-tab-${item.value}`,
            role: "tab",
            // Roving tabindex: the active tab is the single tab stop, matching
            // what Radix produced before.
            tabIndex: isActive ? 0 : -1,
          } as const;

          if (item.to) {
            return (
              <Link
                {...shared}
                aria-current={isActive ? "page" : undefined}
                key={item.value}
                params={item.params}
                to={item.to}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              {...shared}
              key={item.value}
              onClick={() => onValueChange?.(item.value)}
              type="button"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ViewTabs;
