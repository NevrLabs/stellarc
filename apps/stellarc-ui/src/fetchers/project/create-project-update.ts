import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
export type CreateProjectUpdateRequest = InferRequestType<
  (typeof client)["project"][":id"]["updates"]["$post"]
>["json"] & { id: string };
export default async function createProjectUpdate({
  id,
  ...json
}: CreateProjectUpdateRequest) {
  const response = await client.project[":id"].updates.$post({
    param: { id },
    json,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
