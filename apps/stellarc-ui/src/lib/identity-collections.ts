// STL-15 §4 (rework c13, D1/D10): row schemas for the nine public identity
// projections served by packages/sync/src/identity-shapes.ts on
// /orgs/:org/v1/shape. Wire format is the Electric-style snapshot envelope:
// rows are snake_case→camelCase mapped projections with secrets (apikey key
// digest, organization AI provider key, account/session rows, avatar bytes)
// never present. Lists here mirror contracts/src/identity's public rows so
// the identity collections and the REST fetchers share one contract.
export type UserPublic = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  locale: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationPublic = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  description: string | null;
  reposEnabled: boolean;
  tablesEnabled: boolean;
  defaultResourcePrivilege: string;
  aiEnabled: boolean;
  aiDefaultTokenLimit: number;
  aiDefaultCharacterLimit: number;
  aiProviderBaseUrl: string | null;
  aiProviderModel: string | null;
  createdAt: string;
};

export type MemberPublic = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  aiTokenLimit: number | null;
  aiCharacterLimit: number | null;
  joinedAt: string;
  user: Pick<UserPublic, "id" | "name" | "email" | "image">;
  principalId: string;
};

export type RolePublic = {
  id: string;
  organizationId: string;
  role: string;
  permission: Record<string, string[]>;
  createdAt: string;
  updatedAt: string | null;
};

export type TeamPublic = {
  id: string;
  name: string;
  organizationId: string;
  source: string;
  icon: string | null;
  parentTeamId: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type TeamMemberPublic = {
  id: string;
  teamId: string;
  userId: string;
  organizationId: string;
  createdAt: string | null;
};

export type InvitationPublic = {
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  teamId: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  inviterId: string;
};

export type ApiKeyPublic = {
  id: string;
  configId: string;
  name: string | null;
  start: string | null;
  referenceId: string;
  prefix: string | null;
  permissions: Record<string, string[]> | null;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: string | null;
  enabled: boolean | null;
  rateLimitEnabled: boolean | null;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: number | null;
  remaining: number | null;
  lastRequest: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrincipalPublic = {
  id: string;
  kind: "human" | "agent";
  userId: string;
};

// §4: allowed shape tables (never account/session/verification/
// identity_grant/identity_import/user_avatar bytes).
export const IDENTITY_SHAPE_TABLES = [
  "organization",
  "organization_member",
  "organization_role",
  "team",
  "team_member",
  "invitation",
  "apikey",
  "principal",
  "user",
] as const;

export type IdentityShapeTable = (typeof IDENTITY_SHAPE_TABLES)[number];
