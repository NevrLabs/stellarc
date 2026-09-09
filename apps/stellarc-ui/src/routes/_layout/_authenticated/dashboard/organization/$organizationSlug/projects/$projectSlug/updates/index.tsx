import { createFileRoute } from "@tanstack/react-router";
import PageTitle from "@/components/page-title";
import ProjectHeader from "@/components/project/project-header";
import ProjectUpdatesPanel from "@/components/project/project-updates-panel";
import { useProjectSlug } from "@/hooks/use-project-slug";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/updates/",
)({ component: UpdatesRoute });
function UpdatesRoute() {
  const { project, isLoading } = useProjectSlug();
  if (isLoading || !project) return <p>Loading…</p>;
  return (
    <>
      <PageTitle title={`${project.name} updates`} />
      <ProjectHeader title={project.name}>
        <ProjectUpdatesPanel projectId={project.id} />
      </ProjectHeader>
    </>
  );
}
