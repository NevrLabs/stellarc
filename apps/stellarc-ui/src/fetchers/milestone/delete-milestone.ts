import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type DeleteMilestoneRequest = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"][":id"]["$delete"]
>["param"];

async function deleteMilestone({ boardId, id }: DeleteMilestoneRequest) {
  const response = await client.milestone.board[":boardId"][":id"].$delete({
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

export default deleteMilestone;
