import { client } from "@kaneo/libs";

async function deleteProjectResourceLink({
  id,
  linkId,
}: {
  id: string;
  linkId: string;
}) {
  const response = await client.project[":id"].resources[":linkId"].$delete({
    param: { id, linkId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export default deleteProjectResourceLink;
