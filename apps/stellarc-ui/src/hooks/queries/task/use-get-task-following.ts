import { useQuery } from "@tanstack/react-query";
import getTaskFollowing from "@/fetchers/task/get-task-following";

function useGetTaskFollowing(taskId: string) {
  return useQuery({
    queryKey: ["task-following", taskId],
    queryFn: () => getTaskFollowing(taskId),
    enabled: Boolean(taskId),
  });
}

export default useGetTaskFollowing;
