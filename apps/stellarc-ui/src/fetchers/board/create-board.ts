import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateBoardRequest = InferRequestType<
  (typeof client)["board"]["$post"]
>["json"];

async function createBoard({
  name,
  slug,
  organizationId,
  icon,
}: CreateBoardRequest) {
  const response = await client.board.$post({
    json: { name, slug, icon, organizationId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default createBoard;
