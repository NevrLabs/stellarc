import { client } from "@kaneo/libs";

async function getColumns(boardId: string) {
  const response = await client.column[":boardId"].$get({
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getColumns;
