import { useInfiniteQuery } from "@tanstack/react-query";
import getMyTasks, { type MyTasksParams } from "@/fetchers/task/get-my-tasks";

const PAGE_SIZE = 50;

function useInfiniteMyTasks({
  organizationId,
  relation = "all",
  includeCompleted = false,
}: MyTasksParams = {}) {
  return useInfiniteQuery({
    queryKey: [
      "my-tasks",
      "infinite",
      organizationId,
      relation,
      includeCompleted,
    ],
    queryFn: ({ pageParam }) =>
      getMyTasks({
        organizationId,
        relation,
        includeCompleted,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    enabled: !!organizationId,
    staleTime: 10_000,
  });
}

export default useInfiniteMyTasks;
