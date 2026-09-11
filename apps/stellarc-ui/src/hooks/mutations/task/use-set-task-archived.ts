import { useMutation, useQueryClient } from "@tanstack/react-query";
import setTaskArchived from "@/fetchers/task/set-task-archived";

/**
 * #226: archive / unarchive a task via `task.archived_at`, NOT via status.
 *
 * Deliberately does not emit or invalidate anything status-shaped beyond the
 * board caches: archiving does not change workflow state, so the activity trail
 * must not claim a status change happened.
 */
export function useSetTaskArchived() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      archived,
    }: {
      taskId: string;
      archived: boolean;
      boardId?: string;
    }) => setTaskArchived(taskId, archived),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
      if (variables.boardId) {
        queryClient.invalidateQueries({
          queryKey: ["tasks", variables.boardId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      queryClient.invalidateQueries({ queryKey: ["task-relations"] });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.taskId],
      });
    },
  });
}

export default useSetTaskArchived;
