import { useQuery } from "@tanstack/react-query";
import getTaskFlags from "@/fetchers/flag/get-task-flags";

function useGetTaskFlags(taskId: string, includeResolved = false) {
  return useQuery({
    enabled: Boolean(taskId),
    queryKey: ["task-flags", taskId, includeResolved],
    queryFn: () => getTaskFlags({ taskId, includeResolved }),
  });
}

export default useGetTaskFlags;
