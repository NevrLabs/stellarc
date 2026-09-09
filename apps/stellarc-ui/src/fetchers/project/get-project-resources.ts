import { client } from "@kaneo/libs";

async function getProjectResources({ id }: { id: string }) {
  const response = await client.project[":id"].resources.$get({
    param: { id },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getProjectResources;
