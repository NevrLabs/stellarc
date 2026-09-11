import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateBoardRequest = InferRequestType<
  (typeof client)["board"][":id"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["board"][":id"]["$put"]>["param"];

async function updateBoard({
  id,
  name,
  icon,
  slug,
  description,
  isPublic,
  subtaskDepthLimit,
  taskStatusOrder,
  backlogStatusOrder,
  defaultAssigneeId,
  defaultAssigneeTeamId,
}: UpdateBoardRequest) {
  const json: Record<string, unknown> = {
    name,
    icon,
    slug,
    description,
    isPublic,
  };
  if (subtaskDepthLimit !== undefined)
    json.subtaskDepthLimit = subtaskDepthLimit;
  if (taskStatusOrder !== undefined) json.taskStatusOrder = taskStatusOrder;
  if (backlogStatusOrder !== undefined)
    json.backlogStatusOrder = backlogStatusOrder;
  if (defaultAssigneeId !== undefined)
    json.defaultAssigneeId = defaultAssigneeId;
  if (defaultAssigneeTeamId !== undefined)
    json.defaultAssigneeTeamId = defaultAssigneeTeamId;

  const response = await client.board[":id"].$put({
    param: { id },
    json: json as UpdateBoardRequest extends { json: infer J } ? J : never,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default updateBoard;
