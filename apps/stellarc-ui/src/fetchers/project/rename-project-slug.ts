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

  return response.json();
}

export default renameProjectSlug;
