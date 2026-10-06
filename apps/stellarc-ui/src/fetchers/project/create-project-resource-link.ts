import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateProjectResourceLinkRequest = InferRequestType<
  (typeof client)["project"][":id"]["resources"]["$post"]
>["json"] &
  InferRequestType<
    (typeof client)["project"][":id"]["resources"]["$post"]
  >["param"];

async function createProjectResourceLink({
  id,
  ...json
}: CreateProjectResourceLinkRequest) {
  const response = await client.project[":id"].resources.$post({
    param: { id },
    json,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}

export default createProjectResourceLink;
