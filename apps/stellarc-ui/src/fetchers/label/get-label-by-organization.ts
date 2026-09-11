import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetLabelsByTaskRequest = InferRequestType<
  (typeof client)["label"]["organization"][":organizationId"]["$get"]
>["param"];

/**
 * A label row as the organization endpoint actually returns it. The route's
 * response schema is narrower than the runtime row, which otherwise leaves
 * every consumer inferring `any` for its callback parameters.
 */
export type OrganizationLabel = {
  id: string;
  name: string;
  color: string;
  source: "kaneo" | "repo";
  taskId: string | null;
  organizationId: string;
  createdAt: string;
};

async function getLabelsByTask({ organizationId }: GetLabelsByTaskRequest) {
  const response = await client.label.organization[":organizationId"].$get({
    param: {
      organizationId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data as OrganizationLabel[];
}

export default getLabelsByTask;
