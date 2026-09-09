import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import useGetLatestProjectUpdate from "@/hooks/queries/project/use-get-latest-project-update";
import { formatDateMedium } from "@/lib/format";
import ProjectContextualResources from "./project-contextual-resources";
import ProjectHealthBadge from "./project-health-badge";
import ProjectMilestonesSection from "./project-milestones-section";
import type { ProjectRowData } from "./project-row";

type ProjectOverviewProps = {
  project: ProjectRowData & {
    description: string | null;
    successCriteria: string | null;
    startDate: string | null;
  };
  organizationId: string;
  organizationSlug: string;
};

/**
 * Project detail root. Unlike Board's `board/$boardSlug/index.tsx` (which
 * redirects to Kanban), Project detail root RENDERS this Overview directly —
 * there is no Kanban/board projection to redirect into.
 */
export function ProjectOverview({
  project,
  organizationId,
  organizationSlug,
}: ProjectOverviewProps) {
  const { data: latest } = useGetLatestProjectUpdate({ projectId: project.id });
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-4" data-testid="project-overview">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.summary")}
        </h2>
        <p className="mt-1">{project.summary}</p>
      </section>

      {project.description && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.description")}
          </h2>
          <p className="mt-1 whitespace-pre-wrap">{project.description}</p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.successCriteria")}
        </h2>
        <p className="mt-1">
          {project.successCriteria ?? t("projects:labels.noScopedWork")}
        </p>
      </section>

      <section className="flex flex-wrap gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.lifecycle")}
          </h2>
          <Badge className="mt-1">
            {t(`projects:lifecycle.${project.status}`)}
          </Badge>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.lead")}
          </h2>
          <p className="mt-1">
            {project.leadUserName ?? project.leadTeamName ?? "—"}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.targetDate")}
          </h2>
          <p className="mt-1">
            {project.targetDate
              ? formatDateMedium(project.targetDate)
              : t("projects:overview.noDueDate")}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:progress.label")}
        </h2>
        <p className="mt-1 text-muted-foreground">
          {project.progress.percent === null
            ? t("projects:progress.noScopedWork")
            : t("projects:progress.completedOfEligible", {
                completed: project.progress.completed,
                eligible: project.progress.eligible,
              })}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.latestHealth", "Latest health")}
        </h2>
        {latest ? (
          <div className="mt-1 space-y-1">
            <ProjectHealthBadge health={latest.health} />
            <p className="text-sm">{latest.content}</p>
            <p className="text-xs text-muted-foreground">
              {latest.authorName ?? "Unknown"}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-muted-foreground">
            {t("projects:labels.noUpdate")}
          </p>
        )}
      </section>

      <ProjectContextualResources
        organizationId={organizationId}
        organizationSlug={organizationSlug}
        projectId={project.id}
      />

      <ProjectMilestonesSection projectId={project.id} />
    </div>
  );
}

export default ProjectOverview;
