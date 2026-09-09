import { useQuery } from "@tanstack/react-query";
import getMilestone from "@/fetchers/milestone/get-milestone";

function useGetMilestone(boardId: string, id: string) {
  return useQuery({
    enabled: Boolean(boardId) && Boolean(id),
    queryKey: ["milestone", boardId, id],
    queryFn: () => getMilestone({ boardId, id }),
  });
}

export default useGetMilestone;
