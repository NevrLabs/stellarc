import { useQuery } from "@tanstack/react-query";
import getTaskRepoLinks from "@/fetchers/task/get-task-repo-links";

function useGetTaskRepoLinks(taskId: string) {
  return useQuery({
    queryFn: () => getTaskRepoLinks(taskId),
    queryKey: ["task-repo-links", taskId],
    enabled: !!taskId,
  });
}

export default useGetTaskRepoLinks;
