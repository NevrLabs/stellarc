import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LoaderCircle, Milestone } from "lucide-react";
import { useState } from "react";
import RepoTaskLinks from "@/components/repo/repo-task-links";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetRepoGithubMetadata from "@/hooks/queries/repo/use-get-repo-github-metadata";
import { getAvatarTone } from "@/lib/avatar-tone";
import { toast } from "@/lib/toast";
import type { RepoLabel } from "@/types/repo";

type Kind = "issue" | "pull-request";

type UpdatePayload = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
};

type Props = {
  kind: Kind;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  labels: RepoLabel[];
  assignees?: string[];
  milestoneNumber?: number | null;
  organizationId: string;
  taskLinks?: import("@/types/repo").RepoTaskLink[];
  descriptionActionTargetId?: never;
};

// ─── shared internals ────────────────────────────────────────────
function useRepoMutations(kind: Kind, repoId: string, number: number) {
  const queryClient = useQueryClient();
  const isIssue = kind === "issue";
  const resourcePath = `/repo/${repoId}/${isIssue ? "issues" : "pull-requests"}/${number}`;
  const queryKey = [
    isIssue ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(getApiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
      ...init,
    });
    if (!response.ok)
      throw new Error((await response.text()) || "GitHub update failed");
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["repo", repoId] });
  };

  const update = useMutation({
    mutationFn: (payload: UpdatePayload) =>
      request(resourcePath, { body: JSON.stringify(payload), method: "PATCH" }),
    // Optimistic update: patch the cached item immediately so labels,
    // assignees, and milestone changes feel instant instead of waiting on a
    // GitHub round trip. Rolled back if the request fails.
    onMutate: async (payload: UpdatePayload) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const item = current as Record<string, unknown> & {
          github?: Record<string, unknown> | null;
        };
        const next: Record<string, unknown> = { ...item };
        if (payload.labels !== undefined) {
          // Preserve each label's color from the cached item so the optimistic
          // render doesn't flash uncoloured chips before the refetch lands.
          const existing = new Map(
            ((item.labels as { name: string; color?: string }[]) ?? []).map(
              (label) => [label.name, label.color],
            ),
          );
          next.labels = payload.labels.map((name) => ({
            name,
            color: existing.get(name),
          }));
        }
        if (payload.assignees !== undefined) {
          next.assigneeLogins = payload.assignees;
        }
        if (payload.title !== undefined) next.title = payload.title;
        if (payload.body !== undefined) next.body = payload.body;
        if (payload.state !== undefined) next.state = payload.state;
        if (payload.milestone !== undefined) {
          next.github = {
            ...(item.github ?? {}),
            milestone:
              payload.milestone === null ? null : { number: payload.milestone },
          };
        }
        return next;
      });
      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    // Always reconcile with the server so GitHub stays the source of truth.
    onSettled: invalidate,
  });

  return { update, resourcePath, queryKey, invalidate, request };
}

// ─── right sidebar: metadata pickers only ───────────────────────

export function RepoIssueSidebar({
  kind,
  repoId,
  number,

  labels,
  assignees = [],
  milestoneNumber = null,
  organizationId,
  taskLinks,
}: Props) {
  const name = kind === "issue" ? "Issue" : "Pull Request";
  const { update } = useRepoMutations(kind, repoId, number);
  const { data: metadata, isLoading: metadataLoading } =
    useGetRepoGithubMetadata({ repoId });

  const selectedLabels = labels.map((l) => l.name);
  const [pendingField, setPendingField] = useState<
    "labels" | "assignees" | "milestone" | null
  >(null);

  const updateMetadata = (
    field: "labels" | "assignees" | "milestone",
    payload: UpdatePayload,
  ) => {
    setPendingField(field);
    update.mutate(payload, {
      onSuccess: () => toast.success("Updated on GitHub."),
      onError: () => toast.error("GitHub could not save this update."),
      onSettled: () => setPendingField(null),
    });
  };

  const toggleLabel = (label: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedLabels, label])]
      : selectedLabels.filter((l) => l !== label);
    updateMetadata("labels", { labels: next });
  };

  const toggleAssignee = (login: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...assignees, login])]
      : assignees.filter((a) => a !== login);
    updateMetadata("assignees", { assignees: next });
  };

  const setMilestone = (value: string) => {
    const n = value === "none" ? null : Number(value);
    updateMetadata("milestone", { milestone: n });
  };

  const emptyMeta = !metadataLoading && metadata;
  const isGithubIssue = kind === "issue";

  return (
    <aside
      className="space-y-4 border-border/80 p-5 sm:p-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:border-l"
      aria-label={`${name} metadata`}
      id="repo-item-metadata-sidebar"
    >
      {/* Labels */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Labels</p>
        <Menu>
          <MenuTrigger
            render={
              <Button
                className="w-full justify-between"
                disabled={pendingField === "labels"}
                size="sm"
                variant="ghost"
              />
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {pendingField === "labels" && (
                <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
              )}
              {selectedLabels.length > 0 ? (
                <>
                  {selectedLabels.slice(0, 3).map((ln) => {
                    const lbl = metadata?.labels.find((l) => l.name === ln);
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                        key={ln}
                        style={
                          lbl
                            ? {
                                backgroundColor: `#${lbl.color}22`,
                                color: `#${lbl.color}`,
                              }
                            : undefined
                        }
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: lbl ? `#${lbl.color}` : "#999",
                          }}
                        />
                        {ln}
                      </span>
                    );
                  })}
                  {selectedLabels.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{selectedLabels.length - 3}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">None yet</span>
              )}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>Apply labels</MenuGroupLabel>
              {metadataLoading && <MenuItem disabled>Loading labels…</MenuItem>}
              {emptyMeta && metadata.labels.length === 0 && (
                <MenuItem disabled>No labels in this repository</MenuItem>
              )}
              {metadata?.labels.map((label) => (
                <MenuCheckboxItem
                  checked={selectedLabels.includes(label.name)}
                  key={label.name}
                  onCheckedChange={(checked) =>
                    toggleLabel(label.name, checked)
                  }
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full border"
                      style={{ backgroundColor: `#${label.color}` }}
                    />
                    {label.name}
                  </span>
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>

      {/* Assignees */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Assignees
        </p>
        <Menu>
          <MenuTrigger
            render={
              <Button
                className="w-full justify-between"
                disabled={pendingField === "assignees"}
                size="sm"
                variant="ghost"
              />
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {pendingField === "assignees" && (
                <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
              )}
              {assignees.length > 0 ? (
                assignees.map((login) => (
                  <span className="flex items-center gap-1 text-xs" key={login}>
                    <Avatar className={`size-4 ${getAvatarTone(login)}`}>
                      <AvatarFallback className="bg-transparent text-[7px]">
                        {login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {login}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  No assignees
                </span>
              )}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>Assign people</MenuGroupLabel>
              {metadataLoading && <MenuItem disabled>Loading people…</MenuItem>}
              {emptyMeta && metadata.assignableUsers.length === 0 && (
                <MenuItem disabled>No assignable users</MenuItem>
              )}
              {metadata?.assignableUsers.map((user) => (
                <MenuCheckboxItem
                  checked={assignees.includes(user.login)}
                  key={user.login}
                  onCheckedChange={(checked) =>
                    toggleAssignee(user.login, checked)
                  }
                >
                  <span className="flex items-center gap-2">
                    <Avatar className={`size-5 ${getAvatarTone(user.login)}`}>
                      <AvatarImage alt={user.login} src={user.avatarUrl} />
                      <AvatarFallback className="bg-transparent text-[8px]">
                        {user.login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {user.login}
                  </span>
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>

      {/* Milestone */}
      {isGithubIssue && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Milestone
          </p>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  className="w-full justify-between"
                  disabled={pendingField === "milestone"}
                  size="sm"
                  variant="ghost"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate text-xs">
                {pendingField === "milestone" && (
                  <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                )}
                {(() => {
                  const ms = metadata?.milestones.find(
                    (m) => m.number === milestoneNumber,
                  );
                  return ms ? (
                    <>
                      <Milestone className="size-3.5" />
                      {ms.title}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No milestone</span>
                  );
                })()}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-56">
              <MenuGroup>
                <MenuGroupLabel>Set milestone</MenuGroupLabel>
                {metadataLoading && (
                  <MenuItem disabled>Loading milestones…</MenuItem>
                )}
              </MenuGroup>
              <MenuRadioGroup
                onValueChange={(value) => setMilestone(String(value))}
                value={milestoneNumber ? String(milestoneNumber) : "none"}
              >
                <MenuRadioItem value="none">No milestone</MenuRadioItem>
                {metadata?.milestones.map((milestone) => (
                  <MenuRadioItem
                    key={milestone.number}
                    value={String(milestone.number)}
                  >
                    {milestone.title}
                    {milestone.state === "closed" && " (closed)"}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>
        </div>
      )}

      <div className="border-t border-border/80 pt-3">
        <RepoTaskLinks
          compact
          itemType={kind === "issue" ? "issues" : "pull-requests"}
          number={number}
          organizationId={organizationId}
          repoId={repoId}
          taskLinks={taskLinks}
        />
      </div>
    </aside>
  );
}

// Default export for backwards compat with any other import site
export default RepoIssueSidebar;
