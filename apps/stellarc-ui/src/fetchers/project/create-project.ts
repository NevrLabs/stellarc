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

  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}

export default createProject;
