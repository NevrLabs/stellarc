import { client } from "@kaneo/libs";

async function archiveBoard({ id }: { id: string }) {
  const response = await client.board[":id"].archive.$put({ param: { id } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default archiveBoard;
