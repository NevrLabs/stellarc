import { client } from "@kaneo/libs";

async function unarchiveProject({ id }: { id: string }) {
  const response = await client.project[":id"].unarchive.$put({
    param: { id },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default unarchiveProject;
