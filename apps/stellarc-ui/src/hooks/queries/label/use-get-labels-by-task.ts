import { useQuery } from "@tanstack/react-query";
import getLabelsByTask from "@/fetchers/label/get-labels-by-task";

function useGetLabelsByTask(taskId: string) {
  return useQuery({
    queryKey: ["labels", taskId],
    queryFn: () => getLabelsByTask({ taskId }),
    // No refetchOnMount override: it defeated the global staleTime and made
    // every remount refire. Labels are invalidated by the TASK_LABEL_UPDATED
    // websocket message, so the cache stays correct without it.
  });
}

export default useGetLabelsByTask;
