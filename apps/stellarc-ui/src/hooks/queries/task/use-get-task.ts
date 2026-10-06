import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import getTask from "@/fetchers/task/get-task";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useWorkTicketLive } from "@/lib/work-live-store";
import type Task from "@/types/task";

/**
 * STL-16 §4/§6 (T31): the ticket detail sheet/page reads the LIVE ticket
 * collection; REST stays as bootstrap/compat. Public shape unchanged.
 */
function useGetTask(taskId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();
  const { task } = useWorkTicketLive(organization?.id ?? "", taskId, user?.id);
  // Live rows land in the react-query cache under the same ["task", id] key
  // every cache consumer (detail sheet, mutations, invalidations) expects.
  useEffect(() => {
    if (!task) return;
    queryClient.setQueryData<Task>(["task", taskId], task as unknown as Task);
  }, [task, taskId, queryClient]);
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
    staleTime: 5 * 60_000,
  });
}

export default useGetTask;
