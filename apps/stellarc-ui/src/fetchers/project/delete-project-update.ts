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
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}
