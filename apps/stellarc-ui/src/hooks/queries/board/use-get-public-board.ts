import { useQuery } from "@tanstack/react-query";
import getPublicBoard from "@/fetchers/board/get-public-board";

function useGetPublicBoard(id: string) {
  return useQuery({
    queryKey: ["public-board", id],
    queryFn: () => getPublicBoard({ id }),
  });
}

export default useGetPublicBoard;
