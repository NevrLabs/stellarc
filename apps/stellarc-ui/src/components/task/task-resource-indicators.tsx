import { CircleDot, GitPullRequest } from "lucide-react";
import type Task from "@/types/task";

type ResourceIndicator = {
  id: string;
  kind: "Issue" | "PR";
  number: number | string;
  synced: boolean;
  title: string | null;
  url: string;
};

function isUsableResource(
  resource: ResourceIndicator,
): resource is ResourceIndicator {
  return (
    Boolean(resource.url.trim()) && Boolean(String(resource.number).trim())
  );
}

export function getTaskResourceIndicators(task: Task): ResourceIndicator[] {
  const resources: ResourceIndicator[] = [
    ...(task.repoLinks ?? []).map((link) => ({
      id: `repo-${link.id}`,
      kind: link.itemType === "issues" ? ("Issue" as const) : ("PR" as const),
      number: link.number,
      synced: link.itemType === "issues" && link.syncEnabled,
      title: link.title,
      url: link.url,
    })),
    ...(task.externalLinks ?? [])
      .filter(
        (link) =>
          link.resourceType === "issue" || link.resourceType === "pull_request",
      )
      .map((link) => ({
        id: `external-${link.id}`,
        kind:
          link.resourceType === "issue" ? ("Issue" as const) : ("PR" as const),
        number: link.externalId,
        synced: link.resourceType === "issue",
        title: link.title,
        url: link.url,
      })),
  ];

  const uniqueResources = new Map<string, ResourceIndicator>();
  for (const resource of resources.filter(isUsableResource)) {
    if (!uniqueResources.has(resource.url)) {
      uniqueResources.set(resource.url, resource);
    }
  }
  return [...uniqueResources.values()];
}

export default function TaskResourceIndicators({
  task,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
}) {
  const resources = getTaskResourceIndicators(task);
  if (resources.length === 0) return null;

  const visibleResources = resources.slice(0, compact ? 2 : 3);
  const summary = resources
    .map(
      (resource) =>
        `${resource.synced ? "Synced" : "Linked"} ${resource.kind} #${resource.number}${resource.title ? `: ${resource.title}` : ""}`,
    )
    .join("\n");

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      data-testid="task-resource-indicators"
      title={summary}
    >
      {visibleResources.map((resource) => (
        <a
          aria-label={`${resource.synced ? "Synced" : "Linked"} ${resource.kind} #${resource.number}`}
          className="inline-flex max-w-24 items-center gap-1 rounded border border-border/70 bg-muted/55 px-1.5 py-1 text-[10px] font-medium text-muted-foreground"
          href={resource.url}
          key={resource.id}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          {resource.kind === "Issue" ? (
            <CircleDot className="h-3 w-3" />
          ) : (
            <GitPullRequest className="h-3 w-3" />
          )}
          <span className="truncate">
            {resource.synced ? "Synced" : resource.kind} #{resource.number}
          </span>
        </a>
      ))}
      {resources.length > visibleResources.length && (
        <span className="text-[10px] text-muted-foreground">
          +{resources.length - visibleResources.length}
        </span>
      )}
    </div>
  );
}
