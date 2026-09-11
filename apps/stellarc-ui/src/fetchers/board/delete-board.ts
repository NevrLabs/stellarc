import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type DeleteBoardRequest = InferRequestType<
  (typeof client)["board"][":id"]["$delete"]
>["param"];

async function deleteBoard({ id }: DeleteBoardRequest) {
  const response = await client.board[":id"].$delete({ param: { id } });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default deleteBoard;
