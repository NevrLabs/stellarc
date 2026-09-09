import { useQuery } from "@tanstack/react-query";
import getTrashedTasks from "@/fetchers/task/get-trashed-tasks";

export const trashedTasksQueryKey = (organizationId?: string) => [
  "trashed-tasks",
  organizationId,
];

/**
 * Recycle bin list for an organization (#53).
 */
function useGetTrashedTasks(organizationId?: string) {
  return useQuery({
    queryKey: trashedTasksQueryKey(organizationId),
    queryFn: () => getTrashedTasks(organizationId as string),
    enabled: !!organizationId,
  });
}

export default useGetTrashedTasks;
