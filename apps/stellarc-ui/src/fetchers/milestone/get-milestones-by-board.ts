import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetMilestonesByBoardRequest = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"]["$get"]
>["param"];

async function getMilestonesByBoard({ boardId }: GetMilestonesByBoardRequest) {
  const response = await client.milestone.board[":boardId"].$get({
    param: {
      boardId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

/**
 * A single milestone row as returned by the board-scoped list endpoint.
 *
 * Exported because several components map over these rows; without a named
 * type each callback parameter fell back to implicit `any` and tripped
 * noImplicitAny under tsconfig.app.json.
 */
export type Milestone = Awaited<
  ReturnType<typeof getMilestonesByBoard>
>[number];

export default getMilestonesByBoard;
