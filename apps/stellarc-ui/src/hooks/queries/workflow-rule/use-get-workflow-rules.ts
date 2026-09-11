import { useQuery } from "@tanstack/react-query";
import getWorkflowRules from "@/fetchers/workflow-rule/get-workflow-rules";

export function useGetWorkflowRules(boardId: string) {
  return useQuery({
    queryKey: ["workflow-rules", boardId],
    queryFn: () => getWorkflowRules(boardId),
    enabled: !!boardId,
  });
}
