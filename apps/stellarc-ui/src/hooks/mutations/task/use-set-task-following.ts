import { useMutation, useQueryClient } from "@tanstack/react-query";
import setTaskFollowing from "@/fetchers/task/set-task-following";

/**
 * KFL-339: toggle the current user's subscription to a ticket.
 *
 * The toggle is optimistic so the chip flips instantly, but it RECONCILES:
 * the server's authoritative `{ following }` is written back on success, the
 * snapshot is rolled back on error, and the query is invalidated either way.
 */
export function useSetTaskFollowing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      following,
    }: {
      taskId: string;
      following: boolean;
    }) => setTaskFollowing(taskId, following),
    onMutate: async ({ taskId, following }) => {
      const queryKey = ["task-following", taskId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { following });
      return { previous, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["task-following", variables.taskId], {
        following: data.following,
      });
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task-following", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export default useSetTaskFollowing;
