import { useMutation, useQueryClient } from "@tanstack/react-query";
import restoreTask from "@/fetchers/task/restore-task";

/**
 * Restore from the recycle bin (#53). Both the trash list and the board task
 * list are stale afterwards: the row leaves one and re-enters the other.
 */
export function useRestoreTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trashed-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export default useRestoreTask;
