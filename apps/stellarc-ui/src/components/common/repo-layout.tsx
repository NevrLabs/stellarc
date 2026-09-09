import { useLocation } from "@tanstack/react-router";
import {
  CircleDot,
  Code2,
  GitPullRequest,
  Package,
  Rocket,
} from "lucide-react";
import type { ReactNode } from "react";
import Layout from "@/components/common/layout";
import { ViewTabs } from "@/components/common/view-tabs";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";

type RepoLayoutProps = {
  repoId: string;
  organizationId: string;
  children: ReactNode;
  headerActions?: ReactNode;
};

const VIEWS = [
  {
    label: "Code",
    icon: Code2,
    key: "code" as const,
    to: "/dashboard/organization/$organizationSlug/repo/$repoId/code" as const,
  },
  {
    label: "Issues",
    icon: CircleDot,
    key: "issues" as const,
    to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues" as const,
  },
  {
    label: "Pull requests",
    icon: GitPullRequest,
    key: "pulls" as const,
    to: "/dashboard/organization/$organizationSlug/repo/$repoId/pulls" as const,
  },
  {
    label: "Releases",
    icon: Rocket,
    key: "releases" as const,
    to: "/dashboard/organization/$organizationSlug/repo/$repoId/releases" as const,
  },
  {
    label: "Packages",
    icon: Package,
    key: "packages" as const,
    to: "/dashboard/organization/$organizationSlug/repo/$repoId/packages" as const,
  },
];

export default function RepoLayout({
  repoId,
  organizationId,
  children,
  headerActions,
}: RepoLayoutProps) {
  const location = useLocation();
  const { data: repo } = useGetRepo({ id: repoId });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const activeView =
    VIEWS.find((view) => location.pathname.includes(`/${view.key}`))?.key ??
    "issues";

  return (
    <Layout>
      <Layout.Header className="sticky top-0 z-10 h-11 border-border/80 px-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 items-center gap-1 text-xs md:flex">
              {repo ? (
                <a
                  aria-label={`Open ${repoTitle} in a new tab`}
                  className="truncate text-foreground/75 hover:underline"
                  href={repo.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {repoTitle}
                </a>
              ) : (
                <span className="truncate text-foreground/75">{repoTitle}</span>
              )}
            </div>

            <ViewTabs
              aria-label="Repository views"
              items={VIEWS.map((view) => {
                const Icon = view.icon;
                return {
                  value: view.key,
                  label: view.label,
                  icon: <Icon className="size-3.5" />,
                  to: view.to,
                  params: { organizationSlug: organizationId, repoId },
                };
              })}
              value={activeView}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
          </div>
        </div>
      </Layout.Header>
      <Layout.Content>{children}</Layout.Content>
    </Layout>
  );
}
