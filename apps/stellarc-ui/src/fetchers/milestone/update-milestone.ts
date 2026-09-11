import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

type UpdateMilestoneParam = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"][":id"]["$put"]
>["param"];

type UpdateMilestoneJson = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"][":id"]["$put"]
>["json"];

export type UpdateMilestoneRequest = UpdateMilestoneParam & UpdateMilestoneJson;

async function updateMilestone({
  boardId,
  id,
  ...values
}: UpdateMilestoneRequest) {
  const response = await client.milestone.board[":boardId"][":id"].$put({
    param: {
      boardId,
      id,
    },
    json: values,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default updateMilestone;
