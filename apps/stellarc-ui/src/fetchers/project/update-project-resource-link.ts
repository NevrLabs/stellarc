import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateProjectResourceLinkRequest = InferRequestType<
  (typeof client)["project"][":id"]["resources"][":linkId"]["$put"]
>["json"] &
  InferRequestType<
    (typeof client)["project"][":id"]["resources"][":linkId"]["$put"]
  >["param"];

async function updateProjectResourceLink({
  id,
  linkId,
  ...json
}: UpdateProjectResourceLinkRequest) {
  const response = await client.project[":id"].resources[":linkId"].$put({
    param: { id, linkId },
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

export default updateProjectResourceLink;
