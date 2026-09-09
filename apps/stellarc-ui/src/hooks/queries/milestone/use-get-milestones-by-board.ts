import { useQuery } from "@tanstack/react-query";
import getMilestonesByBoard from "@/fetchers/milestone/get-milestones-by-board";

function useGetMilestonesByBoard(boardId: string) {
  return useQuery({
    enabled: Boolean(boardId),
    queryKey: ["milestones", boardId],
    queryFn: () => getMilestonesByBoard({ boardId }),
  });
}

export default useGetMilestonesByBoard;
