import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetMilestoneRequest = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"][":id"]["$get"]
>["param"];

async function getMilestone({ boardId, id }: GetMilestoneRequest) {
  const response = await client.milestone.board[":boardId"][":id"].$get({
    param: {
      boardId,
      id,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default getMilestone;
