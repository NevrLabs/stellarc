import { useMutation } from "@tanstack/react-query";
import exportTasks from "@/fetchers/task/export-tasks";

const useExportTasks = () => {
  return useMutation({
    mutationFn: (boardId: string) => exportTasks(boardId),
  });
};

export default useExportTasks;
