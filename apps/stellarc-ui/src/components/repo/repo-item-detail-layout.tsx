import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, PanelRight } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { RepoDescriptionEditor } from "@/components/repo/repo-description-editor";
import { RepoIssueSidebar } from "@/components/repo/repo-detail-management";
import {
  type RepoItemActionProps,
  RepoItemCommentComposer,
  RepoItemHeaderActions,
} from "@/components/repo/repo-item-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/fetchers/get-api-url";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { RepoTaskLink } from "@/types/repo";

/**
 * Shared shell for the GitHub issue and pull request detail routes. Both pages
 * render the same chrome — back button, article header, two column grid with
 * description/history/footer/actions/task links and a metadata sidebar — so it
 * lives here once and the routes only supply what genuinely differs.
 */

export type RepoItemKind = "issue" | "pull-request";

type RepoItemCopy = {
  /** Lowercase noun used inside sentences. */
  noun: string;
  /** Sentence-initial noun. */
  nounTitle: string;
  /** Plural used by "Back to …". */
  plural: string;
  itemType: "issues" | "pull-requests";
  backButtonClassName: string;
  skeletonBackWidth: string;
};

const REPO_ITEM_COPY: Record<RepoItemKind, RepoItemCopy> = {
  issue: {
    noun: "issue",
    nounTitle: "Issue",
    plural: "issues",
    itemType: "issues",
    // The issues route keeps a master/detail layout on large screens, so the
    // back button only matters on mobile.
    backButtonClassName: "mb-5 gap-1.5 lg:hidden",
    skeletonBackWidth: "w-28",
  },
  "pull-request": {
    noun: "pull request",
    nounTitle: "Pull request",
    plural: "pull requests",
    itemType: "pull-requests",
    // Pulls now share the issues master/detail layout, where the list stays
    // visible on large screens — so the back button is mobile-only.
    backButtonClassName: "mb-5 gap-1.5 lg:hidden",
    skeletonBackWidth: "w-36",
  },
};

/**
 * Derived from the components that consume it so the shell stays in sync with
 * whatever props they expose. The sidebar owns metadata editing; the header
 * actions and comment composer own the item-level mutations.
 */
export type RepoItemManagementProps = ComponentProps<typeof RepoIssueSidebar> &
  RepoItemActionProps;

type RepoItemDetailLayoutProps = {
  kind: RepoItemKind;
  organizationId: string;
  repoId: string;
  number: number;
  onBack: () => void;
  /** Contents of the article `<header>`; the two pages lay this out differently. */
  header: ReactNode;
  body: string | null;
  /** Issue-only conversation timeline. */
  history?: ReactNode;
  /** Kind-specific sections, optionally wrapping the complete conversation. */
  details?: ReactNode | ((discussion: ReactNode) => ReactNode);
  commentCount: number;
  closedAt?: string | null;
  mergedAt?: string | null;
  management: RepoItemManagementProps;
  taskLinks?: RepoTaskLink[];
  /**
   * Drops the metadata sidebar and collapses the grid to one column. The PR
   * diff view uses this so the diff gets the full width, matching GitHub.
   */
  hideSidebar?: boolean;
};

export function RepoItemDetailLayout({
  kind,
  organizationId,
  repoId,
  number,
  onBack,
  header,
  body,
  history,
  details,
  commentCount,
  closedAt,
  mergedAt,
  management,
  taskLinks,
  hideSidebar = false,
}: RepoItemDetailLayoutProps) {
  const copy = REPO_ITEM_COPY[kind];
  // The metadata sidebar is hideable on BOTH the issue and pull request detail
  // surfaces, the same way the board header hides its properties panel. It was
  // previously only ever force-hidden by the PR diff view, so the user had no
  // control at all. `hideSidebar` still wins so the diff keeps the full width.
  const [userHidden, setUserHidden] = useState(false);
  const sidebarHidden = hideSidebar || userHidden;

  return (
    <main
      className="flex min-h-full w-full flex-col py-3 sm:px-6 sm:py-6 lg:px-8"
      data-testid="repo-item-detail"
    >
      <Button
        className={copy.backButtonClassName}
        onClick={onBack}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="size-3.5" />
        Back to {copy.plural}
      </Button>
      <article className="flex min-h-0 flex-1 flex-col">
        {/* Keep identity visible once the reader is deep in a long discussion. */}
        <header className="flex flex-col gap-3 border-b border-border/80 bg-background px-4 py-3 sm:px-6 sm:py-4 md:sticky md:top-0 md:z-20 md:bg-background/95 md:backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">{header}</div>
            <div className="flex shrink-0 items-center gap-2">
              <RepoItemHeaderActions {...management} />
              {/* Trailing edge of the header, matching the board's properties
                  toggle placement. Hidden on the diff view, which owns the
                  sidebar's visibility itself. */}
              {!hideSidebar && (
                <button
                  aria-controls="repo-item-metadata-sidebar"
                  aria-expanded={!sidebarHidden}
                  aria-label={`${copy.nounTitle} metadata`}
                  aria-pressed={!sidebarHidden}
                  className={`hidden size-7 items-center justify-center rounded-md hover:bg-accent/60 hover:text-foreground lg:inline-flex ${
                    sidebarHidden
                      ? "text-muted-foreground"
                      : "bg-accent text-foreground"
                  }`}
                  data-testid="repo-item-sidebar-toggle"
                  onClick={() => setUserHidden((hidden) => !hidden)}
                  title={
                    sidebarHidden
                      ? `Show ${copy.noun} metadata`
                      : `Hide ${copy.noun} metadata`
                  }
                  type="button"
                >
                  <PanelRight className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </header>
        <div
          className={cn(
            "grid flex-1 grid-cols-1",
            !sidebarHidden && "lg:grid-cols-[minmax(0,1fr)_18rem]",
          )}
        >
          {/* Main body column. Every section below uses the same px-6 py-5
              rhythm so the left edge and vertical spacing stay consistent. */}
          <div className="flex min-w-0 flex-col">
            {typeof details === "function" ? (
              details(
                <RepoItemDiscussion
                  body={body}
                  closedAt={closedAt}
                  commentCount={commentCount}
                  history={history}
                  kind={kind}
                  management={management}
                  mergedAt={mergedAt}
                  number={number}
                  repoId={repoId}
                />,
              )
            ) : (
              <RepoItemDiscussion
                body={body}
                closedAt={closedAt}
                commentCount={commentCount}
                details={details}
                history={history}
                kind={kind}
                management={management}
                mergedAt={mergedAt}
                number={number}
                repoId={repoId}
              />
            )}
          </div>
          {/* Right sidebar: metadata only. Omitted entirely on the diff view so
              the diff column is not competing with it for width, and hideable
              by the user via the header toggle. */}
          {!sidebarHidden && (
            <ErrorBoundary
              className="m-4"
              fallbackDescription={`${copy.nounTitle} metadata could not be rendered.`}
              fallbackTitle="Sidebar unavailable"
            >
              <RepoIssueSidebar
                {...management}
                organizationId={organizationId}
                taskLinks={taskLinks}
              />
            </ErrorBoundary>
          )}
        </div>
      </article>
    </main>
  );
}

function RepoItemDiscussion({
  body,
  closedAt,
  commentCount,
  details,
  history,
  kind,
  management,
  mergedAt,
  number,
  repoId,
}: {
  body: string | null;
  closedAt?: string | null;
  commentCount: number;
  details?: ReactNode;
  history?: ReactNode;
  kind: RepoItemKind;
  management: RepoItemManagementProps;
  mergedAt?: string | null;
  number: number;
  repoId: string;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border/80 px-4 py-4 sm:px-6 sm:py-5">
        <RepoItemDescription
          body={body ?? ""}
          kind={kind}
          number={number}
          repoId={repoId}
        />
      </div>
      {details}
      {history}
      {(commentCount > 0 || mergedAt || closedAt) && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/80 px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
          {commentCount > 0 && (
            <span className="flex items-center gap-1.5">
              <MessageSquare className="size-3.5" />
              {commentCount} comments
            </span>
          )}
          {mergedAt ? (
            <span>Merged {formatDateMedium(mergedAt)}</span>
          ) : closedAt ? (
            <span>Closed {formatDateMedium(closedAt)}</span>
          ) : null}
        </footer>
      )}
      <div className="mt-auto md:sticky md:bottom-0 md:z-10 md:bg-background/95 md:backdrop-blur">
        <RepoItemCommentComposer {...management} />
      </div>
    </div>
  );
}

function RepoItemDescription({
  body,
  kind,
  repoId,
  number,
}: {
  body: string;
  kind: RepoItemKind;
  repoId: string;
  number: number;
}) {
  const isIssue = kind === "issue";
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: async (markdown: string) => {
      const response = await fetch(
        getApiUrl(
          `/repo/${repoId}/${isIssue ? "issues" : "pull-requests"}/${number}`,
        ),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: markdown }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          isIssue ? "repo-issue" : "repo-pull-request",
          repoId,
          number,
        ],
      });
      toast.success("Description updated on GitHub.");
    },
    onError: () => toast.error("Could not update the description."),
  });

  return (
    <RepoDescriptionEditor
      body={body}
      isSaving={update.isPending}
      onSave={update.mutateAsync}
      repoId={repoId}
    />
  );
}

export function RepoItemAuthor({
  login,
  avatarUrl,
}: {
  login: string | null;
  avatarUrl: string | null;
}) {
  if (!login) return null;
  return (
    <span
      className="flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="repo-item-author"
    >
      <Avatar className={cn("size-6", getAvatarTone(login))}>
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="bg-transparent text-[9px]">
          {login.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {login}
    </span>
  );
}

export function RepoItemDetailSkeleton({ kind }: { kind: RepoItemKind }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Skeleton
        className={cn("mb-5 h-8", REPO_ITEM_COPY[kind].skeletonBackWidth)}
      />
      <div className="rounded-xl border p-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-4 h-5 w-1/3" />
        <Skeleton className="mt-10 h-4 w-full" />
        <Skeleton className="mt-3 h-4 w-5/6" />
      </div>
    </main>
  );
}

export function RepoItemNotFound({
  kind,
  onBack,
}: {
  kind: RepoItemKind;
  onBack: () => void;
}) {
  const copy = REPO_ITEM_COPY[kind];
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{copy.nounTitle} not found</h1>
      <p className="max-w-md text-muted-foreground">
        This {copy.noun} may not exist or is no longer available.
      </p>
      <Button onClick={onBack} variant="outline">
        Back to {copy.plural}
      </Button>
    </main>
  );
}

export { REPO_ITEM_COPY };
