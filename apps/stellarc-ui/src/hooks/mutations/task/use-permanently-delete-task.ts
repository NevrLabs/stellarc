import { useMutation, useQueryClient } from "@tanstack/react-query";
import permanentlyDeleteTask from "@/fetchers/task/permanently-delete-task";

/**
 * Permanent delete from the recycle bin (#53). Invalidates the board task list
 * as well as the trash list so no cached board view keeps a purged task.
 */
export function usePermanentlyDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: permanentlyDeleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trashed-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export default usePermanentlyDeleteTask;
