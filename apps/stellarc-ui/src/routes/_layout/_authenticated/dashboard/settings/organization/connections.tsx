import { createFileRoute } from "@tanstack/react-router";
import { OrganizationGithubConnection } from "@/components/connections/organization-github-connection";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/connections",
)({ component: RouteComponent });

function RouteComponent() {
  return (
    <>
      <PageTitle title="Connections" />
      <div className="max-w-3xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-muted-foreground">
            Manage the GitHub Apps installed for this organization. They grant
            Kaneo access to repositories, issues, and pull requests.
          </p>
        </div>
        <OrganizationGithubConnection />
      </div>
    </>
  );
}
