import { client } from "@kaneo/libs";
import type { TaskOrderUpdate } from "@/lib/reorder-board-task";

export default async function reorderTasks(
  boardId: string,
  tasks: TaskOrderUpdate[],
) {
  const response = await client.task.reorder[":boardId"].$patch({
    param: { boardId },
    json: { tasks },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
