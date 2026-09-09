import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetBoardRequest = InferRequestType<
  (typeof client)["board"][":id"]["$get"]
>["param"] &
  InferRequestType<(typeof client)["board"][":id"]["$get"]>["query"];

async function getBoard({ id, organizationId }: GetBoardRequest) {
  const response = await client.board[":id"].$get({
    param: { id },
    query: { organizationId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getBoard;
