import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import ProjectHeader from "@/components/project/project-header";
import ProjectOverview from "@/components/project/project-overview";
import ProjectTabs from "@/components/project/project-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectSlug } from "@/hooks/use-project-slug";

/**
 * KFL-366: unlike `board/$boardSlug/index.tsx` (which redirects to Kanban),
 * Project detail root renders Overview directly — there is no board/ticket
 * projection to redirect into for a Project.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/",
)({
  component: ProjectDetailRouteComponent,
});

export function ProjectDetailRouteComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    project,
    usedSlugAlias,
    isLoading,
    organizationSlug,
    organizationId,
  } = useProjectSlug();
  // Alias resolution redirects with `replace` to the canonical slug.
  useEffect(() => {
    if (project && usedSlugAlias) {
      navigate({
        to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
        params: { organizationSlug, projectSlug: project.slug },
        replace: true,
      });
    }
  }, [project, usedSlugAlias, organizationSlug, navigate]);

  if (isLoading || !project) {
    return (
      <>
        <PageTitle title={t("projects:overview.loading")} />
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title={project.name} />
      <ProjectHeader title={project.name}>
        <ProjectTabs
          active="overview"
          organizationSlug={organizationSlug}
          projectSlug={project.slug}
        />
        <ProjectOverview
          organizationId={organizationId}
          organizationSlug={organizationSlug}
          project={project}
        />
      </ProjectHeader>
    </>
  );
}
