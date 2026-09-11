/**
 * Resolve boardSlug → boardId using the boards query cache.
 * Falls back to the raw param if it already looks like a UUID (backward compat).
 */
import { useParams } from "@tanstack/react-router";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export function useBoardSlug() {
  const { boardSlug, organizationSlug } = useParams({ strict: false });
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { data: boards } = useGetBoards({
    organizationId,
    teamId: null,
  });

  // The param could be a slug OR a legacy UUID — match against both.
  const board =
    boards?.find(
      (b) =>
        b.slug?.toLowerCase() === boardSlug?.toLowerCase() ||
        b.id === boardSlug,
    ) ?? null;

  // Don't return the raw slug as boardId — wait for boards query to resolve.
  // Only pass through if it's a UUID (legacy compat) and we don't have boards yet.
  const boardId = board?.id ?? "";

  return {
    boardId,
    board,
    organizationId,
    organizationSlug: organizationSlug ?? "",
    organization,
  };
}
