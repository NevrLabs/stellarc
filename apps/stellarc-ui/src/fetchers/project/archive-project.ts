import { client } from "@kaneo/libs";

async function archiveProject({ id }: { id: string }) {
  const response = await client.project[":id"].archive.$put({
    param: { id },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default archiveProject;
