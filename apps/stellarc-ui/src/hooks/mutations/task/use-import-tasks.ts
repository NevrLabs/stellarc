import { useMutation, useQueryClient } from "@tanstack/react-query";
import importTasks, { type TaskToImport } from "@/fetchers/task/import-tasks";

const useImportTasks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      boardId,
      tasks,
    }: {
      boardId: string;
      tasks: TaskToImport[];
    }) => importTasks(boardId, tasks),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", variables.boardId] });
    },
  });
};

export default useImportTasks;
