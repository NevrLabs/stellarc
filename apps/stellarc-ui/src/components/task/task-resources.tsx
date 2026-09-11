import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleDot,
  ExternalLink,
  GitBranch,
  Github,
  GitMerge,
  GitPullRequest,
  GitPullRequestCreateArrow,
  Image as ImageIcon,
  Link2,
  Search,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import createResourceLink from "@/fetchers/external-link/create-resource-link";
import deleteResourceLink from "@/fetchers/external-link/delete-resource-link";
import { getApiUrl } from "@/fetchers/get-api-url";
import getRepoIssues from "@/fetchers/repo/get-repo-issues";
import getRepoPullRequests from "@/fetchers/repo/get-repo-pull-requests";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import useGetTaskRepoLinks from "@/hooks/queries/task/use-get-task-repo-links";
import { getRepoIssueRelationTarget } from "@/lib/repo-issue-relation-link";
import { toast } from "@/lib/toast";
import type { ExternalLink as ExternalLinkType } from "@/types/external-link";
import { extractDescriptionResources } from "./description-resources";
import ResourcePickerRow from "./resource-picker-row";
import { ResourceSyncBadge } from "./resource-sync-badge";
import { selectResourceAutoLinks } from "./task-resource-links";

type ResourceType = "issues" | "pull-requests";

type TaskResourcesProps = {
  taskId: string;
  organizationId: string;
  /**
   * #265: links/attachments in the description surface as resources. Optional so
   * the section still renders for callers that do not have it to hand.
   */
  description?: string | null;
};

type ResourceItem = {
  id: string;
  number: number;
  title: string;
  repoId: string;
  repoLabel: string;
  state: string;
  isDraft: boolean | null;
  itemType: ResourceType;
};

type ResourceGroup = {
  value: string;
  label: string;
  items: ResourceItem[];
};

/**
 * Derives "owner/repo" from a GitHub/Gitea resource URL.
 *
 * Auto-synced links only carry a URL — they are not tied to a Kaneo `repo` row,
 * so there is no id to look the repository up by.
 */
function getRepoLabelFromUrl(url: string) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    return `${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

/**
 * Repository name shown beside each resource.
 *
 * Truncation is done with CSS rather than by slicing the string so the full
 * "owner/repo" stays available in the native tooltip, and so a long name can
 * never push the title or row actions out of the row.
 */
function RepoLabel({ label }: { label: string }) {
  return (
    <span
      className="max-w-[38%] shrink-0 truncate text-xs text-muted-foreground"
      title={label}
    >
      {label}
    </span>
  );
}

async function linkResource({
  repoId,
  itemType,
  number,
  taskId,
}: {
  repoId: string;
  itemType: ResourceType;
  number: number;
  taskId: string;
}) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/${itemType}/${number}/task-links`),
    {
      body: JSON.stringify({ taskId }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || "Could not link resource.");
  }
}

async function createSyncedIssue({
  repoId,
  taskId,
}: {
  repoId: string;
  taskId: string;
}) {
  const response = await fetch(getApiUrl(`/repo/${repoId}/synced-issues`), {
    body: JSON.stringify({ taskId }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Could not create the GitHub issue.",
    );
  }

  return (await response.json()) as { number: number; htmlUrl: string };
}

export default function TaskResources({
  taskId,
  organizationId,
  description,
}: TaskResourcesProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRepoId, setCreateRepoId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // "all" shows issues and PRs merged (they share one number counter); the
  // footer toggle narrows to a single kind. Per-row icons differentiate.
  const [resourceFilter, setResourceFilter] = useState<"all" | ResourceType>(
    "all",
  );
  // "all" or a repo id — the side rail filter, mirroring the parent selector's
  // board rail (KFL-333 review feedback).
  const [commandRepoId, setCommandRepoId] = useState("all");
  // #265: the generic "just paste a link" path.
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const queryClient = useQueryClient();
  const { data: links = [] } = useGetTaskRepoLinks(taskId);
  const { data: externalLinks = [] } = useExternalLinks(taskId);
  const { data: repos = [] } = useGetRepos({ organizationId });

  // A task can follow at most one GitHub issue (enforced by the API), so the
  // create action is only offered while none exists.
  const syncedIssue = (externalLinks as ExternalLinkType[]).find(
    (link) => link.resourceType === "issue",
  );

  // The command palette searches across every connected repo at once, so it
  // must fetch from all of them. Scoping to `repos[0]` made the picker show
  // "No issues found" whenever the first repository happened to have none,
  // even though other repos in the organization did.
  const RESOURCE_LIMIT = 100;
  const repoIds = useMemo(() => repos.map((repo) => repo.id), [repos]);

  const issueQueries = useQueries({
    queries: repoIds.map((repoId) => ({
      queryFn: () =>
        getRepoIssues({
          repoId,
          state: "all" as const,
          page: 1,
          limit: RESOURCE_LIMIT,
        }),
      queryKey: ["repo-issues", repoId, "all", 1, RESOURCE_LIMIT],
      enabled: commandOpen && resourceFilter !== "pull-requests",
    })),
  });

  const pullRequestQueries = useQueries({
    queries: repoIds.map((repoId) => ({
      queryFn: () =>
        getRepoPullRequests({
          repoId,
          state: "all" as const,
          page: 1,
          limit: RESOURCE_LIMIT,
        }),
      queryKey: ["repo-pull-requests", repoId, "all", 1, RESOURCE_LIMIT],
      enabled: commandOpen && resourceFilter !== "issues",
    })),
  });

  const link = useMutation({
    mutationFn: linkResource,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not link resource.",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["task-repo-links", taskId],
      });
      toast.success("GitHub resource linked.");
      setCommandOpen(false);
      setSearchQuery("");
    },
  });

  const createIssue = useMutation({
    mutationFn: createSyncedIssue,
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the GitHub issue.",
      ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["task-repo-links", taskId],
        }),
        // The create button keys off external links, so they must refresh too
        // or the action would linger after the issue exists.
        queryClient.invalidateQueries({
          queryKey: ["external-links", taskId],
        }),
      ]);
      setCreateOpen(false);
      setCreateRepoId("");
      toast.success(`Created and synced GitHub issue #${result.number}.`);
    },
  });

  const unlink = useMutation({
    mutationFn: async (target: {
      repoId: string;
      itemType: ResourceType;
      number: number;
    }) => {
      const response = await fetch(
        getApiUrl(
          `/repo/${target.repoId}/${target.itemType}/${target.number}/task-links/${taskId}`,
        ),
        { credentials: "include", method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error((await response.text()) || "Could not remove link.");
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove link.",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["task-repo-links", taskId],
      });
      toast.success("GitHub resource unlinked.");
    },
  });

  /**
   * #265: a resource is literally a link to wherever something already lives,
   * so the generic path is just "paste a URL". Issues and PRs keep their own
   * richer pickers above; this is the escape hatch for everything else —
   * boards, tickets, repos, files, tables, a Figma doc, whatever.
   */
  const addLink = useMutation({
    mutationFn: createResourceLink,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not add the link.",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["external-links", taskId],
      });
      setLinkUrl("");
      setLinkTitle("");
      setAddLinkOpen(false);
      toast.success("Resource linked.");
    },
  });

  const removeLink = useMutation({
    mutationFn: deleteResourceLink,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove the link.",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["external-links", taskId],
      });
      toast.success("Resource removed.");
    },
  });

  // Keyed by repo as well as number: issue #13 in one repository has nothing to
  // do with issue #13 in another, so an existing link must not hide it there.
  const linkedKeys = useMemo(
    () =>
      new Set(
        links.map((item) => `${item.repoId}-${item.itemType}-${item.number}`),
      ),
    [links],
  );

  /**
   * Auto-synced links (board↔GitHub/Gitea integration, webhooks) live in a
   * different table than manually linked repo items, but users think of them as
   * one list, so they render under a single "Resources" header.
   *
   * Only manual links can be unlinked here — an auto-synced link would just be
   * recreated by the next sync, so offering the action would be a lie.
   */
  const allAutoLinks = useMemo(
    () => selectResourceAutoLinks(externalLinks as ExternalLinkType[], links),
    [externalLinks, links],
  );

  /**
   * #265: manual links live in the same table as integration-owned ones, but
   * they are NOT auto-synced, so they must not render with the "linked
   * automatically" badge and they DO get a remove action. Splitting them here
   * keeps the existing auto-link row rendering untouched.
   */
  const manualLinks = useMemo(
    () => allAutoLinks.filter((link) => link.resourceType === "link"),
    [allAutoLinks],
  );

  const autoLinks = useMemo(
    () => allAutoLinks.filter((link) => link.resourceType !== "link"),
    [allAutoLinks],
  );

  /**
   * #265: links and attachments already in the description surface as
   * resources. Derived, never persisted — the description stays the source of
   * truth, so these cannot drift from the text. Anything already linked
   * explicitly is dropped so the same URL is not listed twice.
   */
  const descriptionResources = useMemo(() => {
    const known = new Set([
      ...manualLinks.map((link) => link.url),
      ...autoLinks.map((link) => link.url),
      ...links.map((item) => item.url),
    ]);

    return extractDescriptionResources(description).filter(
      (resource) => !known.has(resource.url),
    );
  }, [autoLinks, description, links, manualLinks]);

  const hasAnyResource =
    links.length > 0 ||
    autoLinks.length > 0 ||
    manualLinks.length > 0 ||
    descriptionResources.length > 0;

  /** repoId -> "owner/name", so manual links can show their repository. */
  const repoLabelById = useMemo(
    () => new Map(repos.map((repo) => [repo.id, `${repo.owner}/${repo.name}`])),
    [repos],
  );

  // One group per repository, matching how Relations groups tasks by board.
  // Repos with no matching items are omitted so the palette does not show
  // empty headers.
  const commandGroups = useMemo<ResourceGroup[]>(() => {
    return repos.flatMap((repo, index) => {
      if (commandRepoId !== "all" && repo.id !== commandRepoId) return [];

      const repoLabel = `${repo.owner}/${repo.name}`;
      const fromSource = (
        source: Array<{
          number: number;
          title: string;
          state: string;
          isDraft?: boolean | null;
        }>,
        itemType: ResourceType,
      ): ResourceItem[] =>
        source
          .filter(
            (resource) =>
              !linkedKeys.has(`${repo.id}-${itemType}-${resource.number}`),
          )
          .map((resource) => ({
            id: `${repo.id}-${itemType}-${resource.number}`,
            number: resource.number,
            title: resource.title,
            repoId: repo.id,
            repoLabel,
            state: resource.state,
            isDraft: resource.isDraft ?? null,
            itemType,
          }));

      const items: ResourceItem[] = [
        ...(resourceFilter !== "pull-requests"
          ? fromSource(issueQueries[index]?.data?.data ?? [], "issues")
          : []),
        ...(resourceFilter !== "issues"
          ? fromSource(
              pullRequestQueries[index]?.data?.data ?? [],
              "pull-requests",
            )
          : []),
      ].sort((a, b) => b.number - a.number);

      return items.length > 0
        ? [{ value: repo.id, label: repoLabel, items }]
        : [];
    });
  }, [
    commandRepoId,
    issueQueries,
    linkedKeys,
    pullRequestQueries,
    repos,
    resourceFilter,
  ]);

  const isLoadingResources = [...issueQueries, ...pullRequestQueries].some(
    (query) => query.isLoading,
  );

  const handleLink = (item: ResourceItem) => {
    link.mutate({
      itemType: item.itemType,
      number: item.number,
      repoId: item.repoId,
      taskId,
    });
  };

  return (
    <section className="flex flex-col gap-1" data-slot="task-resources">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs font-medium text-foreground/70">
          Resources
        </span>
        <Button
          onClick={() => setCommandOpen(true)}
          size="icon-xs"
          variant="ghost"
        >
          <Link2 className="size-3.5" />
          <span className="sr-only">Link GitHub resource</span>
        </Button>
      </div>

      {hasAnyResource && (
        <div className="flex flex-col gap-0.5">
          {links.map((item) => (
            <div
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
              key={item.id}
            >
              {item.itemType === "issues" ? (
                <CircleDot className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
              )}
              {/*
                A repo link points at a repository Kaneo itself renders, so it
                navigates in-app. Board-level GitHub links (rendered elsewhere)
                have no Kaneo page and open on GitHub instead.
              */}
              <Link
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm hover:text-primary hover:underline"
                params={{
                  organizationId,
                  repoId: item.repoId,
                  number: String(item.number),
                }}
                to={
                  item.itemType === "issues"
                    ? "/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number"
                    : "/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number"
                }
              >
                <span className="font-mono text-xs text-muted-foreground">
                  #{item.number}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {/*
                  #75: Linked vs Synced.
                    Linked  — "this ticket mentions this issue" (no badge).
                    Synced  — "this ticket's content is synced to this issue".
                  The distinction is the row's own `syncEnabled` flag, which
                  "Create synced issue in repo" sets. Badging by item type
                  instead labelled every linked issue as Synced.
                */}
                {item.syncEnabled && <ResourceSyncBadge resourceType="issue" />}
                {repoLabelById.has(item.repoId) && (
                  <RepoLabel label={repoLabelById.get(item.repoId) as string} />
                )}
              </Link>
              {/* Button composes via `render`, not `asChild`. */}
              <Button
                aria-label={`Open #${item.number} on GitHub`}
                className="opacity-0 group-hover:opacity-100"
                render={
                  <a href={item.url} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-3.5" />
                  </a>
                }
                size="icon-xs"
                variant="ghost"
              />
              <Button
                aria-label={`Unlink #${item.number}`}
                className="opacity-0 group-hover:opacity-100"
                disabled={unlink.isPending}
                onClick={() =>
                  unlink.mutate({
                    itemType: item.itemType,
                    number: item.number,
                    repoId: item.repoId,
                  })
                }
                size="icon-xs"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}

          {autoLinks.map((link) => {
            const isMerged = link.metadata?.merged === true;
            const isPullRequest = link.resourceType === "pull_request";
            const isBranch = link.resourceType === "branch";
            const repoLabel = getRepoLabelFromUrl(link.url);

            /*
              #30: integration-linked rows were hardcoded to github.com. When the
              issue/PR lives in a repository connected to this organization it
              must open inside Kaneo. Branches have no in-app page, so they still
              go out to the provider.
            */
            const internalTarget =
              isBranch || !link.externalId
                ? null
                : getRepoIssueRelationTarget(
                    { number: Number(link.externalId), html_url: link.url },
                    repos,
                    organizationId,
                  );
            const internal =
              internalTarget?.internal === true ? internalTarget : null;

            const rowClassName =
              "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60";

            const body = (
              <>
                {/*
                  Auto-synced rows carry a small Link2 badge over the resource
                  icon so they are distinguishable from manually linked items,
                  which are the only ones that can be unlinked here.
                */}
                <span
                  className="relative flex size-4 shrink-0 items-center justify-center"
                  title="Linked automatically by the repository integration"
                >
                  {isBranch ? (
                    <GitBranch className="size-4 text-muted-foreground" />
                  ) : isMerged ? (
                    <GitMerge className="size-4 text-info-foreground" />
                  ) : isPullRequest ? (
                    <GitPullRequest className="size-4 text-muted-foreground" />
                  ) : (
                    <CircleDot className="size-4 text-muted-foreground" />
                  )}
                  <Link2
                    aria-hidden
                    className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-background text-muted-foreground"
                  />
                  <span className="sr-only">Linked automatically</span>
                </span>
                {!isBranch && (
                  <span className="font-mono text-xs text-muted-foreground">
                    #{link.externalId}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {link.title || link.externalId}
                </span>
                <ResourceSyncBadge resourceType={link.resourceType} />
                {repoLabel && <RepoLabel label={repoLabel} />}
                <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </>
            );

            if (internal) {
              const pullTarget = isPullRequest
                ? {
                    ...internal,
                    to: "/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number" as const,
                  }
                : internal;

              return (
                <Link
                  className={rowClassName}
                  key={link.id}
                  params={pullTarget.params}
                  to={pullTarget.to}
                >
                  {body}
                </Link>
              );
            }

            return (
              <a
                className={rowClassName}
                href={link.url}
                key={link.id}
                rel="noreferrer"
                target="_blank"
              >
                {body}
              </a>
            );
          })}
        </div>
      )}

      {/*
        #265: manually added links. Same table as integration rows, but no
        "linked automatically" badge and a remove action, because these are the
        only external_link rows a user owns.
      */}
      {manualLinks.length > 0 && (
        <div className="flex flex-col">
          {manualLinks.map((link) => (
            <div
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
              key={link.id}
            >
              <a
                className="flex min-w-0 flex-1 items-center gap-2"
                data-testid="manual-resource-link"
                href={link.url}
                rel="noreferrer"
                target="_blank"
              >
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {link.title || link.url}
                </span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </a>
              <Button
                aria-label={`Remove ${link.title || link.url}`}
                disabled={removeLink.isPending}
                onClick={() => removeLink.mutate({ id: link.id, taskId })}
                size="icon-xs"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/*
        #265: links and attachments found in the description. Derived from the
        description on every render, so there is no remove action — the way to
        remove one is to edit the description, which keeps the text and this
        list from ever disagreeing.
      */}
      {descriptionResources.length > 0 && (
        <div className="flex flex-col">
          {descriptionResources.map((resource) => (
            <a
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
              data-testid="description-resource-link"
              href={resource.url}
              key={resource.id}
              rel="noreferrer"
              target="_blank"
              title={resource.url}
            >
              {resource.kind === "image" ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{resource.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                From description
              </span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          data-testid="add-resource-link"
          onClick={() => setAddLinkOpen(true)}
          type="button"
        >
          <Link2 className="size-4" />
          <span>Add link</span>
        </button>
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setCommandOpen(true)}
          type="button"
        >
          <Github className="size-4" />
          <span>Link issue or pull request</span>
        </button>
        {/*
          Creating a synced issue is the inverse of linking an existing one, so
          it sits beside the link action. Hidden once the task already follows
          an issue: the API allows only one synced issue per task, so offering
          it again could only ever produce a 409.
        */}
        {!syncedIssue && repos.length > 0 && (
          <button
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            <GitPullRequestCreateArrow className="size-4" />
            <span>Create synced issue in repo</span>
          </button>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create synced issue in repo</DialogTitle>
            <DialogDescription>
              Opens a new GitHub issue seeded from this task's title and
              description. Afterwards GitHub is authoritative — its updates
              overwrite the task's title and description.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-2 text-sm">
              <label htmlFor="create-synced-issue-repository">Repository</label>
              <Combobox
                autoHighlight
                itemToStringLabel={(repo) => `${repo.owner}/${repo.name}`}
                items={repos}
                onValueChange={(repo) => setCreateRepoId(repo?.id ?? "")}
                value={repos.find((repo) => repo.id === createRepoId) ?? null}
              >
                <ComboboxInput
                  aria-label="Repository for the new issue"
                  id="create-synced-issue-repository"
                  placeholder="Search repositories…"
                />
                <ComboboxPopup>
                  <ComboboxEmpty>No repositories found.</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(repo) => (
                        <ComboboxItem key={repo.id} value={repo}>
                          {repo.owner}/{repo.name}
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxList>
                </ComboboxPopup>
              </Combobox>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!createRepoId || createIssue.isPending}
              onClick={() =>
                createIssue.mutate({ repoId: createRepoId, taskId })
              }
            >
              {createIssue.isPending ? "Creating…" : "Create issue"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/*
        #265: the generic add-a-resource path. Deliberately just a URL and an
        optional label — a resource records WHERE something is, not the bytes.
      */}
      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Add link</DialogTitle>
            <DialogDescription>
              Link anything that already lives somewhere else — a board, ticket,
              repository, file, table or any other URL.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form
              className="flex flex-col gap-3 text-sm"
              id="add-resource-link-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!linkUrl.trim() || addLink.isPending) return;
                addLink.mutate({
                  taskId,
                  title: linkTitle.trim() || undefined,
                  url: linkUrl.trim(),
                });
              }}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="add-resource-link-url">URL</label>
                <Input
                  autoFocus
                  data-testid="add-resource-link-url"
                  id="add-resource-link-url"
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://…"
                  type="url"
                  value={linkUrl}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="add-resource-link-title">
                  Label{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  data-testid="add-resource-link-title"
                  id="add-resource-link-title"
                  onChange={(event) => setLinkTitle(event.target.value)}
                  placeholder="Design doc"
                  value={linkTitle}
                />
              </div>
            </form>
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setAddLinkOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              data-testid="add-resource-link-submit"
              disabled={!linkUrl.trim() || addLink.isPending}
              form="add-resource-link-form"
              type="submit"
            >
              {addLink.isPending ? "Adding…" : "Add link"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandDialogPopup className="h-105 max-w-3xl">
          {/* Repo rail on the left, palette on the right — same two-pane
              layout as the parent selector (KFL-333 review feedback). */}
          <div className="grid min-h-0 flex-1 overflow-hidden sm:grid-cols-[12rem_1fr]">
            <nav
              aria-label="Repositories"
              className="flex min-h-0 gap-1 overflow-x-auto border-b p-2 sm:block sm:overflow-y-auto sm:overflow-x-visible sm:border-r sm:border-b-0"
            >
              {[{ id: "all", owner: "", name: "All" }, ...repos].map((repo) => (
                <button
                  aria-pressed={commandRepoId === repo.id}
                  className={`flex h-9 shrink-0 items-center rounded-md px-3 text-left text-sm sm:w-full ${
                    commandRepoId === repo.id
                      ? "bg-accent font-medium"
                      : "hover:bg-accent/60"
                  }`}
                  data-testid={`resource-picker-rail-${repo.id}`}
                  key={repo.id}
                  onClick={() => setCommandRepoId(repo.id)}
                  type="button"
                >
                  <span className="truncate">
                    {repo.owner ? `${repo.owner}/${repo.name}` : repo.name}
                  </span>
                </button>
              ))}
            </nav>
            {/* Command (Autocomplete.Root) renders NO DOM node — without this
                wrapper its children become separate grid items and the panel
                wraps into the rail column below the nav (the reported break). */}
            <div className="flex min-h-0 min-w-0 flex-col">
              <Command items={commandGroups}>
                <CommandInput
                  placeholder="Search issues and pull requests..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <CommandPanel className="flex-1 overflow-y-auto">
                  <CommandEmpty>
                    <div className="text-center py-6">
                      <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {repos.length === 0
                          ? "No repositories are connected to this organization yet."
                          : isLoadingResources
                            ? "Loading…"
                            : resourceFilter === "all"
                              ? "No issues or pull requests found."
                              : `No ${resourceFilter === "issues" ? "issues" : "pull requests"} found.`}
                      </p>
                    </div>
                  </CommandEmpty>
                  <CommandList>
                    {(group: ResourceGroup, groupIndex: number) => (
                      <Fragment key={group.value}>
                        <CommandGroup items={group.items}>
                          <CommandGroupLabel>{group.label}</CommandGroupLabel>
                          <CommandCollection>
                            {(item: ResourceItem) => (
                              <CommandItem
                                key={item.id}
                                value={`#${item.number} ${item.title} ${item.repoLabel}`}
                                onClick={() => handleLink(item)}
                                className="flex items-center gap-3 py-2"
                              >
                                <ResourcePickerRow item={item} />
                              </CommandItem>
                            )}
                          </CommandCollection>
                        </CommandGroup>
                        {groupIndex < commandGroups.length - 1 && (
                          <CommandSeparator />
                        )}
                      </Fragment>
                    )}
                  </CommandList>
                </CommandPanel>
                <CommandFooter>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${resourceFilter === "all" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid="resource-filter-all"
                      onClick={() => setResourceFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${resourceFilter === "issues" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid="resource-filter-issues"
                      onClick={() => setResourceFilter("issues")}
                    >
                      <CircleDot className="size-3" />
                      Issues
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${resourceFilter === "pull-requests" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid="resource-filter-pull-requests"
                      onClick={() => setResourceFilter("pull-requests")}
                    >
                      <GitPullRequest className="size-3" />
                      Pull requests
                    </button>
                  </div>
                  <span className="text-muted-foreground/60">
                    Select to link
                  </span>
                </CommandFooter>
              </Command>
            </div>
          </div>
        </CommandDialogPopup>
      </CommandDialog>
    </section>
  );
}
