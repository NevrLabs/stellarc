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

  return response.json();
}

export default updateProjectResourceLink;
