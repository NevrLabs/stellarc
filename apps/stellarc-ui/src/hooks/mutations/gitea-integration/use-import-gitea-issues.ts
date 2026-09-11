import { useMutation, useQueryClient } from "@tanstack/react-query";
import importGiteaIssues from "@/fetchers/gitea-integration/import-gitea-issues";

export default function useImportGiteaIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => importGiteaIssues(boardId),
    onSuccess: (_, boardId) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
    },
  });
}
