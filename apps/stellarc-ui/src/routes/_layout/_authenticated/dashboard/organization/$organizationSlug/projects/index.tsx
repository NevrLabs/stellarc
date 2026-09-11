import { createFileRoute } from "@tanstack/react-router";
import ProjectsOverview from "@/components/project/projects-overview";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <ProjectsOverview />;
}
