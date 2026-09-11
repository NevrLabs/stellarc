import { useQuery } from "@tanstack/react-query";
import getTask from "@/fetchers/task/get-task";

function useGetTask(taskId: string) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
    staleTime: 5 * 60_000,
  });
}

export default useGetTask;
