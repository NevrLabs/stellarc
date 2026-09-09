import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateProjectRequest = InferRequestType<
  (typeof client)["project"][":id"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["project"][":id"]["$put"]>["param"];

async function updateProject({ id, ...json }: UpdateProjectRequest) {
  const response = await client.project[":id"].$put({
    param: { id },
    json,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default updateProject;
