import type { authClient } from "@/lib/auth-client";

export type Organization = NonNullable<
  Awaited<
    ReturnType<typeof authClient.organization.getFullOrganization>
  >["data"]
>;

export type ActiveOrganization = NonNullable<
  ReturnType<typeof authClient.useActiveOrganization>["data"]
>;

export default Organization;
