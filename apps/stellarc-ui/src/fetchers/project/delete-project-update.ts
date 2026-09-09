import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
export type DeleteProjectUpdateRequest = InferRequestType<
  (typeof client)["project"][":id"]["updates"][":updateId"]["$delete"]
>["param"];
export default async function deleteProjectUpdate({
  id,
  updateId,
}: DeleteProjectUpdateRequest) {
  const response = await client.project[":id"].updates[":updateId"].$delete({
    param: { id, updateId },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
