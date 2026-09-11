import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetProjectsRequest = InferRequestType<
  (typeof client)["project"]["$get"]
>["query"];

async function getProjects({
  organizationId,
  includeArchived,
}: GetProjectsRequest) {
  if (!organizationId) return;

  const response = await client.project.$get({
    query: { organizationId, includeArchived },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getProjects;
