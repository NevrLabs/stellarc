import { Milestone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export type MilestoneBadgeMilestone = {
  id: string;
  name: string;
  status?: string | null;
};

type MilestoneBadgeProps = {
  milestone: MilestoneBadgeMilestone | undefined | null;
  className?: string;
};

const statusClassNames: Record<string, string> = {
  planned: "text-muted-foreground",
  active: "text-indigo-600 dark:text-indigo-400",
  completed: "text-emerald-600 dark:text-emerald-400",
  archived: "text-muted-foreground line-through",
};

/**
 * Small read-only badge for task metadata rows. Renders nothing when the task
 * has no milestone so callers can drop it in unconditionally.
 */
export default function MilestoneBadge({
  milestone,
  className,
}: MilestoneBadgeProps) {
  const { t } = useTranslation();

  if (!milestone) return null;

  const statusKey = milestone.status ?? "planned";
  const statusLabel = t(`tasks:milestone.status.${statusKey}`, {
    defaultValue: t("tasks:milestone.status.planned"),
  });

  return (
    <span
      data-testid="milestone-badge"
      title={t("tasks:milestone.badgeTooltip", {
        name: milestone.name,
        status: statusLabel,
      })}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium max-w-[12rem]",
        statusClassNames[statusKey] ?? statusClassNames.planned,
        className,
      )}
    >
      <Milestone className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{milestone.name}</span>
    </span>
  );
}
