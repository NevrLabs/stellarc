import { Archive, ArchiveRestore } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateMedium } from "@/lib/format";

export type ProjectProgress = {
  completed: number;
  eligible: number;
  percent: number | null;
};

export type ProjectRowData = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  status: "planned" | "started" | "completed" | "canceled";
  priority: string | null;
  leadUserName: string | null;
  leadTeamName: string | null;
  startDate: string | null;
  targetDate: string | null;
  archivedAt: string | null;
  progress: ProjectProgress;
  health: null;
};

type ProjectRowProps = {
  project: ProjectRowData;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  canArchive?: boolean;
};

const LIFECYCLE_VARIANT: Record<
  ProjectRowData["status"],
  "secondary" | "default" | "outline"
> = {
  planned: "secondary",
  started: "default",
  completed: "outline",
  canceled: "outline",
};

/**
 * KFL-366: Project outcome metadata ONLY — deliberately no Board-Ticket
 * execution controls (no column/status assignment, no ticket ownership).
 * Progress/health render as presentation-only placeholders since this
 * ticket persists neither.
 */
export function ProjectRow({
  project,
  onClick,
  onArchive,
  onUnarchive,
  canArchive,
}: ProjectRowProps) {
  const { t } = useTranslation();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: false positive for onClick and onKeyDown
    <div
      className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-3 last:border-b-0"
      data-testid="project-row"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{project.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {project.summary}
        </p>
      </div>
      <Badge variant={LIFECYCLE_VARIANT[project.status]}>
        {t(`projects:lifecycle.${project.status}`)}
      </Badge>
      <span className="w-24 shrink-0 truncate text-sm text-muted-foreground">
        {project.leadUserName ?? project.leadTeamName ?? "—"}
      </span>
      <span className="w-24 shrink-0 text-sm text-muted-foreground">
        {project.targetDate ? formatDateMedium(project.targetDate) : "—"}
      </span>
      <span className="w-32 shrink-0 truncate text-sm text-muted-foreground">
        {project.progress.percent === null
          ? t("projects:progress.noScopedWork")
          : t("projects:progress.completedOfEligible", {
              completed: project.progress.completed,
              eligible: project.progress.eligible,
            })}
      </span>
      {canArchive && (
        <Button
          aria-label={
            project.archivedAt
              ? t("projects:actions.unarchive")
              : t("projects:actions.archive")
          }
          onClick={(event) => {
            event.stopPropagation();
            if (project.archivedAt) onUnarchive?.();
            else onArchive?.();
          }}
          size="icon"
          variant="ghost"
        >
          {project.archivedAt ? (
            <ArchiveRestore className="size-4" />
          ) : (
            <Archive className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}

export default ProjectRow;
