import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateComment from "@/fetchers/comment/update-comment";

function useUpdateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateComment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["activities", data.taskId] });
    },
  });
}

export default useUpdateComment;
