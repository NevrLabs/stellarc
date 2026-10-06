import { and, eq, inArray } from "drizzle-orm";
import db from "./database";
import {
  boardTable,
  dataTableTable,
  organizationMemberTable,
  organizationTable,
  projectTable,
  repoTable,
  resourceGrantTable,
  userTable,
} from "./database/schema";
import { hasOrganizationWideResourceAccess } from "./resource-access-roles";
import { getEffectiveTeamIdsForUser } from "./team/effective-membership";

export const RESOURCE_PRIVILEGES = ["none", "view", "edit", "manage"] as const;
export type ResourcePrivilege = (typeof RESOURCE_PRIVILEGES)[number];
export const RESOURCE_TYPES = ["board", "repo", "table", "project"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * Pure resolver for the organization baseline of ONE resource: the resource's
 * own org_privilege wins ("boardC is hidden to the org"); NULL means "follow
 * org" and inherits the organization-wide default. Garbage stored values fall
 * back to manage (the pre-feature behaviour) instead of granting nonsense.
 */
export function resolveDefaultPrivilege(input: {
  resourceOrgPrivilege?: string | null;
  defaultResourcePrivilege?: string | null;
}): ResourcePrivilege {
  const candidate =
    input.resourceOrgPrivilege ?? input.defaultResourcePrivilege ?? "manage";
  return (RESOURCE_PRIVILEGES as readonly string[]).includes(candidate)
    ? (candidate as ResourcePrivilege)
    : "manage";
}

const RESOURCE_TABLES = {
  board: boardTable,
  repo: repoTable,
  table: dataTableTable,
  project: projectTable,
} as const;

/** The resource's own org baseline column, NULL when it follows the org. */
async function getResourceOrgPrivilege(
  resourceType: ResourceType,
  organizationId: string,
  resourceId: string,
): Promise<string | null> {
  const table = RESOURCE_TABLES[resourceType];
  const [row] = await db
    .select({ orgPrivilege: table.orgPrivilege })
    .from(table)
    .where(
      and(eq(table.id, resourceId), eq(table.organizationId, organizationId)),
    )
    .limit(1);
  return row?.orgPrivilege ?? null;
}

export { hasOrganizationWideResourceAccess };

const rank = new Map(RESOURCE_PRIVILEGES.map((value, index) => [value, index]));

export function highestPrivilege(
  privileges: readonly ResourcePrivilege[],
): ResourcePrivilege {
  return privileges.reduce<ResourcePrivilege>(
    (highest, current) =>
      (rank.get(current) ?? 0) > (rank.get(highest) ?? 0) ? current : highest,
    "none",
  );
}

export async function requireResourcePrivilege(input: {
  organizationId: string;
  resourceType: ResourceType;
  resourceId: string;
  userId: string;
  required: Exclude<ResourcePrivilege, "none">;
}) {
  const actual = await getResourcePrivilege(input);
  return privilegeAllows(actual, input.required);
}

export async function getResourcePrivilege(input: {
  organizationId: string;
  resourceType: ResourceType;
  resourceId: string;
  userId: string;
}): Promise<ResourcePrivilege> {
  const [user, membership, organization, resourceBaseline, grants, teams] =
    await Promise.all([
      db
        .select({ role: userTable.role })
        .from(userTable)
        .where(eq(userTable.id, input.userId))
        .limit(1),
      db
        .select({ role: organizationMemberTable.role })
        .from(organizationMemberTable)
        .where(
          and(
            eq(organizationMemberTable.organizationId, input.organizationId),
            eq(organizationMemberTable.userId, input.userId),
          ),
        )
        .limit(1),
      db
        .select({
          defaultResourcePrivilege: organizationTable.defaultResourcePrivilege,
        })
        .from(organizationTable)
        .where(eq(organizationTable.id, input.organizationId))
        .limit(1),
      getResourceOrgPrivilege(
        input.resourceType,
        input.organizationId,
        input.resourceId,
      ),
      db
        .select({
          privilege: resourceGrantTable.privilege,
          teamId: resourceGrantTable.teamId,
          userId: resourceGrantTable.userId,
        })
        .from(resourceGrantTable)
        .where(
          and(
            eq(resourceGrantTable.organizationId, input.organizationId),
            eq(resourceGrantTable.resourceType, input.resourceType),
            eq(resourceGrantTable.resourceId, input.resourceId),
          ),
        ),
      // Transitive: a sub-team member inherits every ancestor team's grants.
      getEffectiveTeamIdsForUser(input.userId).then((ids) =>
        ids.map((teamId) => ({ teamId })),
      ),
    ]);

  if (hasOrganizationWideResourceAccess(user[0]?.role, membership[0]?.role)) {
    return "manage";
  }

  if (membership.length === 0) return "none";

  const teamIds = new Set(teams.map((team) => team.teamId));
  const applicable = grants
    .filter(
      (grant) =>
        grant.userId === input.userId ||
        (grant.teamId !== null && teamIds.has(grant.teamId)),
    )
    .map((grant) => grant.privilege as ResourcePrivilege);
  // Explicit user/team grant wins; otherwise the resource's own org baseline,
  // and when that is NULL ("follow org"), the organization-wide default.
  if (applicable.length > 0) return highestPrivilege(applicable);
  return resolveDefaultPrivilege({
    resourceOrgPrivilege: resourceBaseline,
    defaultResourcePrivilege: organization[0]?.defaultResourcePrivilege,
  });
}

export function privilegeAllows(
  actual: ResourcePrivilege,
  required: Exclude<ResourcePrivilege, "none">,
) {
  return (rank.get(actual) ?? 0) >= (rank.get(required) ?? 0);
}

export type ResourceGrantRow = {
  resourceId: string;
  teamId: string | null;
  userId: string | null;
  privilege: ResourcePrivilege;
};

/**
 * #122: the pure rule behind the team-view selector.
 *
 * The selector scopes the sidebar to one team ("All" means no scope at all).
 * When a team is selected the listing must answer "what can *this team* see",
 * not "what can the current user see" — a user who is in three teams should
 * get three different board lists, not the same union three times.
 *
 * The privilege is therefore resolved with the team as the principal:
 *   - grants addressed to this team count;
 *   - grants addressed to a *user* (including the caller) do not — that is the
 *     "regardless of user permission" part of the ticket;
 *   - a resource with no grants at all stays visible, because the API's
 *     additive-rollout rule (see getResourcePrivilege) means an ungranted
 *     resource is open to the whole organization, this team included.
 *
 * `grants` must be every grant row for the resources under consideration (both
 * user- and team-addressed), otherwise the ungranted case cannot be detected.
 *
 * This narrows a list the caller can already see; it never widens one. Callers
 * intersect the result with the user's own access so team scoping can never
 * become a way to read a board the user has no grant for.
 */
export function filterResourceIdsForTeam(input: {
  resourceIds: readonly string[];
  grants: readonly ResourceGrantRow[];
  teamId: string;
}): string[] {
  const resourcesWithAnyGrant = new Set<string>();
  const teamPrivileges = new Map<string, ResourcePrivilege[]>();

  for (const grant of input.grants) {
    resourcesWithAnyGrant.add(grant.resourceId);
    if (grant.teamId !== null && grant.teamId === input.teamId) {
      const privileges = teamPrivileges.get(grant.resourceId) ?? [];
      privileges.push(grant.privilege);
      teamPrivileges.set(grant.resourceId, privileges);
    }
  }

  return input.resourceIds.filter((resourceId) => {
    if (!resourcesWithAnyGrant.has(resourceId)) return true;
    const privilege = highestPrivilege(teamPrivileges.get(resourceId) ?? []);
    return privilegeAllows(privilege, "view");
  });
}

async function listTeamAccessibleResourceIds(input: {
  organizationId: string;
  resourceType: ResourceType;
  teamId: string;
  resourceIds: string[];
}) {
  const grants = await db
    .select({
      resourceId: resourceGrantTable.resourceId,
      teamId: resourceGrantTable.teamId,
      userId: resourceGrantTable.userId,
      privilege: resourceGrantTable.privilege,
    })
    .from(resourceGrantTable)
    .where(
      and(
        eq(resourceGrantTable.organizationId, input.organizationId),
        eq(resourceGrantTable.resourceType, input.resourceType),
        inArray(resourceGrantTable.resourceId, input.resourceIds),
      ),
    );

  return filterResourceIdsForTeam({
    resourceIds: input.resourceIds,
    grants: grants as ResourceGrantRow[],
    teamId: input.teamId,
  });
}

export async function listAccessibleResourceIds(input: {
  organizationId: string;
  resourceType: ResourceType;
  userId: string;
  resourceIds: string[];
  /**
   * #122: optional team scope from the team-view selector. Omitted (or null)
   * is the "All" view and keeps the previous user-only behaviour.
   */
  teamId?: string | null;
}) {
  if (input.resourceIds.length === 0) return [];
  const results = await Promise.all(
    input.resourceIds.map(async (resourceId) => ({
      resourceId,
      privilege: await getResourcePrivilege({ ...input, resourceId }),
    })),
  );
  const userAccessible = results
    .filter(({ privilege }) => privilegeAllows(privilege, "view"))
    .map(({ resourceId }) => resourceId);

  if (!input.teamId) return userAccessible;

  // Team scope narrows what the user can already see — never widens it.
  return listTeamAccessibleResourceIds({
    organizationId: input.organizationId,
    resourceType: input.resourceType,
    teamId: input.teamId,
    resourceIds: userAccessible,
  });
}

export const _resourceAccessTest = { rank };
