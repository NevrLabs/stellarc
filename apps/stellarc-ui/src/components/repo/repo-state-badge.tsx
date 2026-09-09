import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

type RepoStateBadgeState = "open" | "closed" | "merged" | "draft";

const stateClassNames: Record<RepoStateBadgeState, string> = {
  open: "bg-success/12 text-success-foreground dark:bg-success/20",
  closed:
    "bg-destructive/12 text-destructive-foreground dark:bg-destructive/20",
  merged:
    "bg-purple-500/12 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  draft: "bg-muted text-muted-foreground",
};

const stateLabelKeys: Record<RepoStateBadgeState, string> = {
  open: "organization:repos.state.open",
  closed: "organization:repos.state.closed",
  merged: "organization:repos.state.merged",
  draft: "organization:repos.state.draft",
};

export default function RepoStateBadge({
  state,
  className,
}: {
  state: RepoStateBadgeState;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Badge
      className={cn(stateClassNames[state], className)}
      data-slot="repo-state-badge"
      size="sm"
    >
      {t(stateLabelKeys[state])}
    </Badge>
  );
}

export type { RepoStateBadgeState };
