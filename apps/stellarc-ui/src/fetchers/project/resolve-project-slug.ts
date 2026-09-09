import { client } from "@kaneo/libs";

async function resolveProjectSlug({
  organizationId,
  slug,
}: {
  organizationId: string;
  slug: string;
}) {
  const response = await client.project.resolve.$get({
    query: { organizationId, slug },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default resolveProjectSlug;
