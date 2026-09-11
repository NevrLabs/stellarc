import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ExternalLink, Rocket } from "lucide-react";
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
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/releases",
)({ component: RouteComponent });

type Release = {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  publishedAt: string | null;
  isDraft: boolean;
  isPrerelease: boolean;
  url: string;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    downloadUrl: string;
    downloadCount: number;
  }>;
};

async function getReleases(repoId: string) {
  const response = await fetch(getApiUrl(`/repo/${repoId}/releases`), {
    credentials: "include",
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Unable to load releases");
  return (await response.json()) as Release[];
}

function RouteComponent() {
  const { organizationSlug, repoId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const { data, error, isLoading } = useQuery({
    queryKey: ["repo-releases", repoId],
    queryFn: () => getReleases(repoId),
  });
  return (
    <>
      <PageTitle title="Releases" />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="text-xl font-semibold">Releases</h1>
            <p className="text-sm text-muted-foreground">
              Published GitHub releases for this repository.
            </p>
          </div>
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading releases…</p>
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
                  <Rocket />
                </EmptyMedia>
                <EmptyTitle>No releases yet</EmptyTitle>
                <EmptyDescription>
                  GitHub has no releases for this repository.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {data?.map((release) => (
            <article className="rounded-xl border bg-card p-5" key={release.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {release.name || release.tagName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {release.tagName}
                    {release.publishedAt
                      ? ` · published ${new Date(release.publishedAt).toLocaleDateString()}`
                      : " · unpublished"}
                  </p>
                </div>
                <a
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  href={release.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub <ExternalLink className="size-3.5" />
                </a>
              </div>
              {release.body && (
                <p className="mt-4 whitespace-pre-wrap text-sm">
                  {release.body}
                </p>
              )}
              {release.assets.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Assets
                  </p>
                  {release.assets.map((asset) => (
                    <a
                      className="flex items-center gap-2 py-1 text-sm hover:text-primary"
                      href={asset.downloadUrl}
                      key={asset.id}
                    >
                      <Download className="size-3.5" />
                      {asset.name}
                      <span className="text-xs text-muted-foreground">
                        {asset.downloadCount} downloads
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </main>
      </RepoLayout>
    </>
  );
}
