import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

type CreateMilestoneParam = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"]["$post"]
>["param"];

type CreateMilestoneJson = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"]["$post"]
>["json"];

export type CreateMilestoneRequest = CreateMilestoneParam & CreateMilestoneJson;

async function createMilestone({
  boardId,
  name,
  description,
  dueDate,
  status,
}: CreateMilestoneRequest) {
  const response = await client.milestone.board[":boardId"].$post({
    param: {
      boardId,
    },
    json: {
      name,
      description,
      dueDate,
      status,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default createMilestone;
