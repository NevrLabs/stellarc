import type { TaskOrderUpdate } from "@/lib/reorder-board-task";
import { workFetch } from "@/lib/work-client";

export default async function reorderTasks(
  boardId: string,
  tasks: TaskOrderUpdate[],
) {
  const envelope = await workFetch<{ data: { ids: string[] }; txid: number }>(
    `/boards/${boardId}/tickets/reorder`,
    {
      method: "PUT",
      json: {
        updates: tasks.map(({ id, position, status }) => ({
          id,
          position,
          status,
        })),
      },
    },
  );
  return envelope.data;
}
