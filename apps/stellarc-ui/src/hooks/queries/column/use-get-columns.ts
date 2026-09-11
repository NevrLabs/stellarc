import { useQuery } from "@tanstack/react-query";
import getColumns from "@/fetchers/column/get-columns";

export function useGetColumns(boardId: string) {
  return useQuery({
    queryKey: ["columns", boardId],
    queryFn: () => getColumns(boardId),
    enabled: !!boardId,
  });
}
