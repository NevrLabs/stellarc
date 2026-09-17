import { client } from "@kaneo/libs";

async function archiveProject({ id }: { id: string }) {
  const response = await client.project[":id"].archive.$put({
    param: { id },
  });
  if (!response.ok) throw new Error(await response.text());
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}

export default archiveProject;
