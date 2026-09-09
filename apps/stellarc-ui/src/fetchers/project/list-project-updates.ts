import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
export type ListProjectUpdatesRequest = InferRequestType<
  (typeof client)["project"][":id"]["updates"]["$get"]
>["param"];
export default async function listProjectUpdates({
  id,
}: ListProjectUpdatesRequest) {
  const response = await client.project[":id"].updates.$get({ param: { id } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
