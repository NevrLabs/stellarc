import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDot, Plus, Workflow, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetRepoIssues from "@/hooks/queries/repo/use-get-repo-issues";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { getRepoIssueRelationTarget } from "@/lib/repo-issue-relation-link";
import { toast } from "@/lib/toast";
import type { RepoIssueGithub } from "@/types/repo";
import RepoStateBadge from "./repo-state-badge";

type Relation = RepoIssueGithub["subIssues"][number];

export default function RepoIssueRelations({
  github,
  number,
  organizationId,
  repoId,
}: {
  github?: RepoIssueGithub;
  number: number;
  organizationId: string;
  repoId: string;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const queryKey = ["repo-issue", repoId, number];
  const resourcePath = `/repo/${repoId}/issues/${number}`;
  const { data: candidates } = useGetRepoIssues({
    repoId,
    state: "all",
    limit: 100,
  });
  const { data: repos = [], isPending: reposPending } = useGetRepos({
    organizationId,
  });
  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(getApiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!response.ok)
      throw new Error((await response.text()) || "GitHub update failed");
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({
    mutationFn: (subIssueNumber: number) =>
      request(`${resourcePath}/sub-issues`, {
        body: JSON.stringify({ subIssueNumber }),
        method: "POST",
      }),
    onSuccess: async () => {
      await refresh();
      setAdding(false);
      setSearch("");
      toast.success("Sub-issue linked on GitHub.");
    },
    onError: () => toast.error("Could not link the sub-issue."),
  });
  const remove = useMutation({
    mutationFn: (subIssueNumber: number) =>
      request(`${resourcePath}/sub-issues/${subIssueNumber}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
    onError: () => toast.error("Could not remove the sub-issue."),
  });
  const filtered = (candidates?.data ?? []).filter(
    (issue) =>
      issue.number !== number &&
      !github?.subIssues.some((item) => item.number === issue.number) &&
      `#${issue.number} ${issue.title}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const row = (item: Relation, label: string, removable = false) => {
    const target = getRepoIssueRelationTarget(item, repos, organizationId);

    return (
      <div className="flex items-center gap-2" key={`${label}-${item.number}`}>
        <CircleDot className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="w-14 shrink-0 text-xs text-muted-foreground">
          {label}
        </span>
        {reposPending ? (
          <span
            className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
            data-testid={`relation-link-${item.number}`}
          >
            #{item.number} {item.title}
          </span>
        ) : target.internal ? (
          <Link
            className="min-w-0 flex-1 truncate text-sm hover:text-primary"
            data-testid={`relation-link-${item.number}`}
            params={target.params}
            to={target.to}
          >
            #{item.number} {item.title}
          </Link>
        ) : (
          <a
            className="min-w-0 flex-1 truncate text-sm hover:text-primary"
            data-testid={`relation-link-${item.number}`}
            href={target.href ?? undefined}
            rel="noreferrer"
            target="_blank"
          >
            #{item.number} {item.title}
          </a>
        )}
        <RepoStateBadge state={item.state === "closed" ? "closed" : "open"} />
        {removable && (
          <Button
            aria-label={`Remove sub-issue #${item.number}`}
            disabled={remove.isPending}
            onClick={() => item.number && remove.mutate(item.number)}
            size="icon-xs"
            variant="ghost"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>
    );
  };
  const count = (github?.parent ? 1 : 0) + (github?.subIssues.length ?? 0);
  return (
    <section
      className="border-b border-border/80 px-4 py-4 sm:px-6 sm:py-5"
      data-testid="repo-issue-relations"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Workflow className="size-4" /> Relations
        </h2>
        <span className="text-xs text-muted-foreground">{count} linked</span>
      </div>
      <div className="space-y-2">
        {github?.parent && row(github.parent, "Parent")}
        {github?.subIssues.map((item) => row(item, "Child", true))}
        {count === 0 && (
          <p className="text-sm text-muted-foreground">
            No parent or sub-issues yet.
          </p>
        )}
      </div>
      {github?.subIssuesSupported && (
        <div className="mt-3">
          {adding ? (
            <div className="space-y-2">
              <Input
                aria-label="Search issues"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search issues…"
                value={search}
              />
              <div className="max-h-48 overflow-y-auto rounded-md border p-1">
                {filtered.length ? (
                  filtered.map((issue) => (
                    <button
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      key={issue.number}
                      onClick={() => add.mutate(issue.number)}
                      type="button"
                    >
                      <span className="text-muted-foreground">
                        #{issue.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {issue.title}
                      </span>
                      <RepoStateBadge
                        state={issue.state === "closed" ? "closed" : "open"}
                      />
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No matching issues.
                  </p>
                )}
              </div>
              <Button
                onClick={() => setAdding(false)}
                size="xs"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button onClick={() => setAdding(true)} size="xs" variant="ghost">
              <Plus className="size-3" /> Add sub-issue
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
