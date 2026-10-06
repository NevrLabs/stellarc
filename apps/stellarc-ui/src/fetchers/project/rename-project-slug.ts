import { client } from "@kaneo/libs";

async function renameProjectSlug({ id, slug }: { id: string; slug: string }) {
  const response = await client.project[":id"].slug.$put({
    param: { id },
    json: { slug },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}

export default renameProjectSlug;
