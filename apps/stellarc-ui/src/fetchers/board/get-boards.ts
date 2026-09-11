import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import type { BoardWithTasks } from "@/types/board";

export type GetBoardsRequest = InferRequestType<
  (typeof client)["board"]["$get"]
>["query"];

async function getBoards({ organizationId, teamId }: GetBoardsRequest) {
  if (!organizationId) return;

  const response = await client.board.$get({
    query: { organizationId, teamId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  // The list endpoint returns the same board-with-task shape consumed by the
  // sidebar. Its route schema is intentionally narrower than the runtime row,
  // so keep the established consumer contract explicit here.
  return data as Array<BoardWithTasks & { id: string }>;
}

export default getBoards;
