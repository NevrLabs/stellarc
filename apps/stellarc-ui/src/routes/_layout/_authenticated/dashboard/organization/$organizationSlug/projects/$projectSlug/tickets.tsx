import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import ProjectHeader from "@/components/project/project-header";
import ProjectTabs from "@/components/project/project-tabs";
import ProjectTicketPicker from "@/components/project/project-ticket-picker";
import ProjectTickets from "@/components/project/project-tickets";
import { Skeleton } from "@/components/ui/skeleton";
import useGetProjectTickets from "@/hooks/queries/project/use-get-project-tickets";
import { useProjectSlug } from "@/hooks/use-project-slug";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/tickets",
)({
  component: ProjectTicketsRouteComponent,
});

export function ProjectTicketsRouteComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { project, usedSlugAlias, isLoading, organizationSlug } =
    useProjectSlug();
  const {
    data,
    error: ticketsError,
    isLoading: isLoadingTickets,
  } = useGetProjectTickets({ id: project?.id ?? "" });

  useEffect(() => {
    if (project && usedSlugAlias) {
      navigate({
        to: "/dashboard/organization/$organizationSlug/projects/$projectSlug/tickets",
        params: { organizationSlug, projectSlug: project.slug },
        replace: true,
      });
    }
  }, [project, usedSlugAlias, organizationSlug, navigate]);

  if (isLoading || !project) {
    return (
      <>
        <PageTitle title={t("projects:tickets.title")} />
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title={`${project.name} — ${t("projects:tickets.title")}`} />
      <ProjectHeader title={project.name}>
        <ProjectTabs
          active="tickets"
          organizationSlug={organizationSlug}
          projectSlug={project.slug}
        />
        <ProjectTicketPicker
          projectId={project.id}
          tickets={data?.tickets ?? []}
        />
        <ProjectTickets
          key={project.id}
          isLoading={isLoadingTickets}
          organizationSlug={organizationSlug}
          projectId={project.id}
          tickets={data?.tickets}
          error={Boolean(ticketsError)}
        />
      </ProjectHeader>
    </>
  );
}
