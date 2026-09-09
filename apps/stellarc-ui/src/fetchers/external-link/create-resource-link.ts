import { client } from "@kaneo/libs";

/**
 * #265: attach a plain link to a task as a resource.
 *
 * A resource is literally a link to wherever something already lives, so this
 * takes a URL and an optional label — no upload, no storage bookkeeping.
 */
async function createResourceLink({
  taskId,
  url,
  title,
}: {
  taskId: string;
  url: string;
  title?: string;
}) {
  const response = await client["external-link"].$post({
    json: { taskId, url, title },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default createResourceLink;
