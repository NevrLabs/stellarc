import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateProjectRequest = InferRequestType<
  (typeof client)["project"]["$post"]
>["json"];

async function createProject(body: CreateProjectRequest) {
  const response = await client.project.$post({ json: body });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default createProject;
