import { useMutation, useQueryClient } from "@tanstack/react-query";
import upsertWorkflowRule from "@/fetchers/workflow-rule/upsert-workflow-rule";

export function useUpsertWorkflowRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: { integrationType: string; eventType: string; columnId: string };
    }) => upsertWorkflowRule(boardId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workflow-rules", variables.boardId],
      });
    },
  });
}
