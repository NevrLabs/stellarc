import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
export type UpdateProjectUpdateRequest = InferRequestType<
  (typeof client)["project"][":id"]["updates"][":updateId"]["$put"]
>["json"] & { id: string; updateId: string };
export default async function updateProjectUpdate({
  id,
  updateId,
  ...json
}: UpdateProjectUpdateRequest) {
  const response = await client.project[":id"].updates[":updateId"].$put({
    param: { id, updateId },
    json,
  });
  if (!response.ok) throw new Error(await response.text());
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}
