import { client } from "@kaneo/libs";
import type { TaskFlag } from "./get-task-flags";

async function getMyFlags(organizationId?: string) {
  const response = await client.flag.mine.$get({
    query: { organizationId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as TaskFlag[];
}

export default getMyFlags;
