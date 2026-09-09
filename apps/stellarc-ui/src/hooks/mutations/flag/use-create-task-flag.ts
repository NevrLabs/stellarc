import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskFlagRequest } from "@/fetchers/flag/create-task-flag";
import createTaskFlag from "@/fetchers/flag/create-task-flag";

function useCreateTaskFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskFlag,
    onSuccess: (_created, variables: CreateTaskFlagRequest) => {
      void queryClient.invalidateQueries({
        queryKey: ["task-flags", variables.taskId],
      });
      // #107: raising a flag writes a flag_raised activity entry, so the feed
      // must refresh too. Without this the entry only appeared later, when
      // resolving the flag invalidated activities — making flag history look
      // like it "only shows up after the flag is unflagged".
      void queryClient.invalidateQueries({
        queryKey: ["activities", variables.taskId],
      });
      void queryClient.invalidateQueries({ queryKey: ["my-flags"] });
    },
  });
}

export default useCreateTaskFlag;
