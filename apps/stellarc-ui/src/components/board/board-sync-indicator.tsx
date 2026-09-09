import { Github } from "lucide-react";
import { useTranslation } from "react-i18next";
import useGetGithubIntegration from "@/hooks/queries/github-integration/use-get-github-integration";

/**
 * "Synced with <repo>" indicator for the board header (#158).
 *
 * Renders nothing at all when the board has no integration, or when the
 * integration exists but is inactive — a stale badge claiming a sync that is
 * switched off would be worse than no badge.
 *
 * Placed to the LEFT of the access avatars in the header, per the ticket.
 */
export default function BoardSyncIndicator({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  const { data: integration } = useGetGithubIntegration(boardId);

  if (!integration?.isActive) return null;

  const owner = integration.repositoryOwner;
  const name = integration.repositoryName;
  if (!name) return null;

  const repo = owner ? `${owner}/${name}` : name;

  return (
    <span
      className="flex min-w-0 shrink items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground"
      data-testid="board-sync-indicator"
      title={t("tasks:boardSync.syncedWith", { repo })}
    >
      <Github aria-hidden="true" className="size-3 shrink-0" />
      {/* Long repo names clip rather than pushing the header around; the full
          value stays available in the tooltip. */}
      <span className="truncate">
        {t("tasks:boardSync.syncedWith", { repo: name })}
      </span>
    </span>
  );
}
