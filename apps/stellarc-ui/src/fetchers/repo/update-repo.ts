import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateRepoRequest = InferRequestType<
  (typeof client)["repo"][":id"]["$patch"]
>["json"] &
  InferRequestType<(typeof client)["repo"][":id"]["$patch"]>["param"];

async function updateRepo({ id, ...json }: UpdateRepoRequest) {
  const response = await client.repo[":id"].$patch({ param: { id }, json });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateRepo;
