import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import getBoards from "@/fetchers/board/get-boards";
import { useWorkBoardListLive } from "@/lib/work-live-store";
import type { BoardWithTasks } from "@/types/board";

/**
 * STL-16 §4/§6 (T29): the sidebar board list reads LIVE collections; REST
 * stays as bootstrap/compat. Public shape ({data}) unchanged — the frozen
 * sidebar and its baseline stay byte-compatible.
 */
function useGetBoards({
  organizationId,
  teamId,
}: {
  organizationId: string;
  teamId?: string | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { boards } = useWorkBoardListLive(organizationId, user?.id);
  // Live rows land in the react-query cache under the same ["boards", org,
  // team] key every cache consumer (prefetch, invalidation) expects.
  useEffect(() => {
    if (!boards) return;
    queryClient.setQueryData<BoardWithTasks[]>(
      ["boards", organizationId, teamId ?? "all"],
      boards as unknown as BoardWithTasks[],
    );
  }, [boards, organizationId, teamId, queryClient]);
  return useQuery({
    queryFn: () => getBoards({ organizationId, teamId: teamId ?? undefined }),
    queryKey: ["boards", organizationId, teamId ?? "all"],
    enabled: !!organizationId,
  });
}

export default useGetBoards;
