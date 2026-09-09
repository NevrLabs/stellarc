import type { ReactNode } from "react";
import { ViewTabs } from "@/components/common/view-tabs";

/**
 * Board view switcher.
 *
 * This is now a thin adapter over the shared `ViewTabs` so board and repo
 * surfaces render one identical control. It previously used Radix `Tabs` with a
 * fully-rounded pill on `bg-muted/55`, which had visibly drifted from the repo
 * switcher's square-cornered nav on `bg-background`.
 *
 * The prop shape is unchanged so existing call sites keep working: board views
 * are state-driven (`list` and `board` share a route and differ by `viewMode`),
 * so items carry no `to` and selection flows through `onValueChange`.
 */
type View = {
  value: string;
  label: string;
  icon: ReactNode;
};

type BoardViewTabsProps = {
  value: string;
  views: View[];
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
};

export function BoardViewTabs({
  value,
  views,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: BoardViewTabsProps) {
  return (
    <ViewTabs
      aria-label={ariaLabel}
      className={className}
      items={views}
      onValueChange={onValueChange}
      value={value}
    />
  );
}
