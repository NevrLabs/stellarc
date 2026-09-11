import { CircleDot, GitPullRequest } from "lucide-react";
import RepoStateBadge from "@/components/repo/repo-state-badge";

export type ResourcePickerItem = {
  id: string;
  number: number;
  title: string;
  repoId: string;
  repoLabel: string;
  /** Provider state as mirrored: open | closed | merged. */
  state: string;
  isDraft: boolean | null;
  /** Which kind of resource this row is; drives the type icon. */
  itemType?: "issues" | "pull-requests";
};

function badgeState(
  item: ResourcePickerItem,
  itemType: "issues" | "pull-requests",
): "open" | "closed" | "merged" | "draft" {
  if (itemType === "pull-requests" && item.isDraft) return "draft";
  if (item.state === "merged") return "merged";
  return item.state === "closed" ? "closed" : "open";
}

/**
 * A row body for the "Link issue or pull request" palette: type icon, number,
 * title, and the provider state badge so users can tell live work from done
 * work before linking.
 */
export default function ResourcePickerRow({
  item,
  itemType,
}: {
  item: ResourcePickerItem;
  /** Fallback when the item doesn't carry its own type (single-kind lists). */
  itemType?: "issues" | "pull-requests";
}) {
  const kind = item.itemType ?? itemType ?? "issues";
  return (
    <>
      {kind === "issues" ? (
        <CircleDot
          className="size-4 shrink-0 text-muted-foreground"
          data-testid={`resource-picker-kind-issue-${item.id}`}
        />
      ) : (
        <GitPullRequest
          className="size-4 shrink-0 text-muted-foreground"
          data-testid={`resource-picker-kind-pr-${item.id}`}
        />
      )}
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        #{item.number}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
      <span data-testid={`resource-picker-state-${item.id}`}>
        <RepoStateBadge state={badgeState(item, kind)} />
      </span>
    </>
  );
}
