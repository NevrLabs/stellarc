import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Box, ExternalLink, Package } from "lucide-react";
import RepoLayout from "@/components/common/repo-layout";
import PageTitle from "@/components/page-title";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getApiUrl } from "@/fetchers/get-api-url";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/packages",
)({ component: RouteComponent });

type GithubPackage = {
  id: number;
  name: string;
  packageType: string;
  visibility: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
};
async function getPackages(repoId: string) {
  const response = await fetch(getApiUrl(`/repo/${repoId}/packages`), {
    credentials: "include",
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Unable to load packages");
  return (await response.json()) as GithubPackage[];
}

function RouteComponent() {
  const { organizationSlug, repoId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const { data, error, isLoading } = useQuery({
    queryKey: ["repo-packages", repoId],
    queryFn: () => getPackages(repoId),
  });
  return (
    <>
      <PageTitle title="Packages" />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="text-xl font-semibold">Packages</h1>
            <p className="text-sm text-muted-foreground">
              GitHub container packages visible to this repository owner.
            </p>
          </div>
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading packages…</p>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
              {error.message}
            </p>
          )}
          {data?.length === 0 && (
            <Empty className="min-h-72 rounded-lg border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>No packages available</EmptyTitle>
                <EmptyDescription>
                  No visible container packages, or the GitHub App has no
                  Packages permission.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {data?.map((pkg) => (
            <a
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
              href={pkg.url}
              key={pkg.id}
              rel="noreferrer"
              target="_blank"
            >
              <Box className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{pkg.name}</p>
                <p className="text-sm text-muted-foreground">
                  {pkg.packageType} · {pkg.visibility} · {pkg.versionCount}{" "}
                  versions
                </p>
              </div>
              <ExternalLink className="size-4 text-muted-foreground" />
            </a>
          ))}
        </main>
      </RepoLayout>
    </>
  );
}
