import { workFetch } from "@/lib/work-client";
import type Task from "@/types/task";

type UpdateTaskStatusPayload = Pick<Task, "status">;

async function updateTaskStatus(taskId: string, task: UpdateTaskStatusPayload) {
  const envelope = await workFetch<{ data: { id: string }; txid: number }>(
    `/tickets/${taskId}/status`,
    { method: "PUT", json: { status: task.status || "" } },
  );
  return envelope.data;
}

export default updateTaskStatus;
