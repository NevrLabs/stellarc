import type { OrganizationPublic } from "@/lib/identity-collections";

// The switcher's structural org shape: the §3 OrganizationPublic projection
// (id/name/slug/logo) plus the members payload get-full-organization used to
// embed. Frozen JSX only reads these fields.
export type Organization = OrganizationPublic & {
  members?: Array<{ id: string; userId: string; role: string }>;
  teams?: Array<{ id: string; name: string }>;
  invitations?: Array<{ id: string; email: string; status: string }>;
};

export type ActiveOrganization = OrganizationPublic;

export default Organization;
