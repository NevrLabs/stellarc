import { useQuery } from "@tanstack/react-query";
import getBoardFlagTypes from "@/fetchers/flag/get-board-flag-types";

function useGetBoardFlagTypes(boardId: string) {
  return useQuery({
    enabled: Boolean(boardId),
    queryKey: ["flag-types", boardId],
    queryFn: () => getBoardFlagTypes({ boardId }),
  });
}

export default useGetBoardFlagTypes;
