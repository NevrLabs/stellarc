import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateTaskRequest = InferRequestType<
  (typeof client)["task"][":boardId"]["$post"]
>["json"] &
  InferRequestType<(typeof client)["task"][":boardId"]["$post"]>["param"];

async function createTask(
  title: string,
  description: string,
  boardId: string,
  userId: string,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  priority: string,
  teamId?: string,
) {
  if (!boardId) {
    throw new Error("No board selected for task creation");
  }

  const json: Record<string, unknown> = {
    title,
    description,
    userId,
    status,
    startDate: startDate?.toISOString() || undefined,
    dueDate: dueDate?.toISOString() || undefined,
    priority,
  };
  if (teamId) json.teamId = teamId;

  const response = await client.task[":boardId"].$post({
    json: json as CreateTaskRequest extends { json: infer J } ? J : never,
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default createTask;
