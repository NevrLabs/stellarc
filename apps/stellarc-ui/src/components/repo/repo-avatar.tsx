import { GitBranch } from "lucide-react";
import { cn } from "@/lib/cn";
import { isKnownIconValue, resolveIcon } from "@/lib/resolve-icon";
import type { Repo } from "@/types/repo";

/**
 * Per-repository identity glyph for the sidebar rail (#96/#171/#173).
 *
 * Repository identity is derived locally from owner/name: no avatar network
 * request, no third-party cookie leakage, stable offline rendering.
 */
export default function RepoAvatar({
  repo,
  className,
}: {
  repo: Repo;
  className?: string;
}) {
  const configuredIcon = repo.config?.icon;

  if (isKnownIconValue(configuredIcon)) {
    const resolved = resolveIcon(configuredIcon);

    if (resolved.kind === "emoji") {
      return (
        <svg
          aria-hidden="true"
          className={cn("size-4 shrink-0 overflow-visible", className)}
          data-icon-kind="emoji"
          data-testid="repo-avatar"
          role="img"
          viewBox="0 0 16 16"
        >
          <text
            dominantBaseline="central"
            fontSize="13"
            textAnchor="middle"
            x="8"
            y="8"
          >
            {resolved.emoji}
          </text>
        </svg>
      );
    }

    const { Icon } = resolved;
    return (
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", className)}
        data-icon-kind="lucide"
        data-testid="repo-avatar"
      />
    );
  }

  const initial = repoInitial(repo);

  if (!initial) {
    return <GitBranch aria-hidden="true" className={cn("size-4", className)} />;
  }

  return (
    /*
      #171 rejection: collapsed SidebarMenuButton deliberately hides every
      direct child except SVG. Both the old span and the first attempted div
      therefore existed in the DOM but had display:none. Keep the repository
      initial inside an actual SVG so generic rail CSS treats it as a glyph.
    */
    <svg
      aria-hidden="true"
      className={cn("size-4 shrink-0 overflow-visible", className)}
      data-testid="repo-avatar"
      role="img"
      viewBox="0 0 16 16"
    >
      <rect fill={repoColor(repo)} height="16" rx="3" width="16" />
      <text
        dominantBaseline="central"
        fill="white"
        fontSize="9"
        fontWeight="700"
        textAnchor="middle"
        x="8"
        y="8"
      >
        {initial.toUpperCase()}
      </text>
    </svg>
  );
}

export function repoInitial(repo: Pick<Repo, "name">) {
  const trimmed = (repo.name ?? "").trim();
  return trimmed ? Array.from(trimmed)[0] : null;
}

export function repoColor(repo: Pick<Repo, "owner" | "name">) {
  const key = `${repo.owner ?? ""}/${repo.name ?? ""}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 55% 45%)`;
}
