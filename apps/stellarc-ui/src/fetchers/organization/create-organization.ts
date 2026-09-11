import { authClient } from "@/lib/auth-client";
import {
  createUniqueOrganizationSlug,
  isOrganizationSlugCollisionError,
} from "@/lib/utils/create-organization-slug";

export type CreateOrganizationRequest = {
  name: string;
  description?: string;
  slug?: string;
  logo?: string;
};

const createOrganization = async ({
  name,
  description,
  slug,
  logo,
}: CreateOrganizationRequest) => {
  const metadata = description ? { description } : undefined;
  const existingOrganizations = slug
    ? []
    : ((await authClient.organization.list()).data ?? []);
  let organizationSlug = slug
    ? slug
    : createUniqueOrganizationSlug(
        name,
        existingOrganizations.map((organization) => organization.slug),
      );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await authClient.organization.create({
      name,
      slug: organizationSlug,
      logo,
      metadata,
    });

    if (!error) {
      return data;
    }

    const createError = new Error(
      error.message || "Failed to create organization",
    );

    if (slug || !isOrganizationSlugCollisionError(createError)) {
      throw createError;
    }

    organizationSlug = createUniqueOrganizationSlug(name, [
      ...existingOrganizations.map((organization) => organization.slug),
      organizationSlug,
    ]);
  }

  throw new Error("Failed to create organization");
};

export default createOrganization;
