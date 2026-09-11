import { client } from "@kaneo/libs";

export type FlagType = {
  id: string;
  boardId: string;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
};

export type GetBoardFlagTypesRequest = {
  boardId: string;
};

async function getBoardFlagTypes({ boardId }: GetBoardFlagTypesRequest) {
  const response = await client.flag.type.board[":boardId"].$get({
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as FlagType[];
}

export default getBoardFlagTypes;
