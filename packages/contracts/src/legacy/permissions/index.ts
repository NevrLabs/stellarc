import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  board: ["create", "read", "update", "delete", "share"],
  // KFL-366: Project is an outcome-tracking domain, parallel to Board.
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  // `manage_connections` and `manage_members` are split out from the broad
  // `manage_settings` so an org can delegate GitHub/integration wiring or
  // membership administration without handing over every setting.
  organization: [
    "read",
    "update",
    "delete",
    "manage_settings",
    "manage_connections",
    "manage_members",
  ],
} as const;

export const ac = createAccessControl(statement);

export const viewer = ac.newRole({
  ...memberAc.statements,
  board: ["read"],
  project: ["read"],
  task: ["read"],
  label: ["read"],
  organization: ["read"],
});

export const member = ac.newRole({
  ...memberAc.statements,
  board: ["create", "read"],
  project: ["create", "read"],
  task: ["create", "read", "update"],
  label: ["create", "read", "update", "delete"],
  organization: ["read"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  board: ["create", "read", "update", "delete", "share"],
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  organization: [
    "read",
    "update",
    "manage_settings",
    "manage_connections",
    "manage_members",
  ],
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  board: ["create", "read", "update", "delete", "share"],
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  organization: [
    "read",
    "update",
    "delete",
    "manage_settings",
    "manage_connections",
    "manage_members",
  ],
});

export const builtInRoles = { viewer, member, admin, owner } as const;

export type BuiltInRoleName = keyof typeof builtInRoles;

// Default-role names that the API seeds per organization. These ARE editable
// in the UI (their permissions live as rows in `organization_role`), but their
// names are reserved and the rows are auto-created on organization creation /
// backfilled at boot. `owner` is intentionally NOT in this list because it
// stays a true static role on the better-auth side.
export const DEFAULT_ROLE_NAMES = ["viewer", "member", "admin"] as const;
export type DefaultRoleName = (typeof DEFAULT_ROLE_NAMES)[number];

function toMutablePayload(
  statements: Record<string, readonly string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(statements)) {
    out[resource] = [...actions];
  }
  return out;
}

// Plain JSON-serializable permission payloads for the seeded default roles.
// Mirrors each role's `.statements` (including better-auth's organization/
// member/team/invitation/ac defaults) so an organization_role row that uses
// one of these has parity with the prior static definition.
export const defaultRolePayloads: Record<
  DefaultRoleName,
  Record<string, string[]>
> = {
  viewer: toMutablePayload(viewer.statements),
  member: toMutablePayload(member.statements),
  admin: toMutablePayload(admin.statements),
};
