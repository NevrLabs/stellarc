import { useQuery } from "@tanstack/react-query";
import getBoardTaskRelations from "@/fetchers/task-relation/get-board-task-relations";

function useGetBoardTaskRelations(boardId: string) {
  return useQuery({
    queryKey: ["board-task-relations", boardId],
    queryFn: () => getBoardTaskRelations(boardId),
    enabled: !!boardId,
  });
}

export default useGetBoardTaskRelations;
