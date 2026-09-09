import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetPublicBoardRequest = InferRequestType<
  (typeof client)["public-board"][":id"]["$get"]
>["param"];

async function getPublicBoard({ id }: GetPublicBoardRequest) {
  const response = await client["public-board"][":id"].$get({
    param: { id },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getPublicBoard;
