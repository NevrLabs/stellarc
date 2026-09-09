import { useQuery } from "@tanstack/react-query";
import getBoards from "@/fetchers/board/get-boards";

function useGetBoards({
  organizationId,
  teamId,
}: {
  organizationId: string;
  teamId?: string | null;
}) {
  return useQuery({
    queryFn: () => getBoards({ organizationId, teamId: teamId ?? undefined }),
    queryKey: ["boards", organizationId, teamId ?? "all"],
    enabled: !!organizationId,
  });
}

export default useGetBoards;
