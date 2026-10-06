import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import db, { schema } from "../database";
import getSettings from "../utils/get-settings";

export type OidcRoleMapping = { role: string; teamId: string };

export function getClaimAtPath(claims: unknown, path: string): unknown {
  if (!claims || typeof claims !== "object") return undefined;
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((value, segment) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
      return (value as Record<string, unknown>)[segment];
    }, claims);
}

export function normalizeRoles(value: unknown): Set<string> {
  if (Array.isArray(value))
    return new Set(
      value.filter((role): role is string => typeof role === "string"),
    );
  return typeof value === "string"
    ? new Set(value.split(/[ ,]+/).filter(Boolean))
    : new Set();
}

export function reconcileMappedTeamIds(
  currentIds: Iterable<string>,
  mappedIds: Iterable<string>,
  desiredIds: Iterable<string>,
) {
  const current = new Set(currentIds);
  const mapped = new Set(mappedIds);
  const desired = new Set(desiredIds);
  return {
    add: Array.from(desired).filter((id) => !current.has(id)),
    remove: Array.from(current).filter(
      (id) => mapped.has(id) && !desired.has(id),
    ),
  };
}

export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    return payload
      ? JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
      : null;
  } catch {
    return null;
  }
}

export async function syncOidcTeams(userId: string, claims: unknown) {
  // Claim mapping is a single-org-mode capability. With multiple organizations
  // a claim has no unambiguous target, so the feature is off rather than
  // guessing which organization an IdP claim was meant for.
  if (!getSettings().singleOrgMode) return;
  const memberships = await db
    .select({ organizationId: schema.organizationMemberTable.organizationId })
    .from(schema.organizationMemberTable)
    .where(eq(schema.organizationMemberTable.userId, userId));
  if (!memberships.length) return;
  const configs = await db
    .select()
    .from(schema.oidcTeamSyncConfigTable)
    .where(
      inArray(
        schema.oidcTeamSyncConfigTable.organizationId,
        memberships.map((item) => item.organizationId),
      ),
    );
  await db.transaction(async (tx) => {
    for (const config of configs) {
      const roles = normalizeRoles(getClaimAtPath(claims, config.claimPath));
      const requested = Array.from(
        new Set(config.roleMappings.map((item) => item.teamId)),
      );
      if (!requested.length) continue;
      const eligible = await tx
        .select({ id: schema.teamTable.id })
        .from(schema.teamTable)
        .where(
          and(
            eq(schema.teamTable.organizationId, config.organizationId),
            eq(schema.teamTable.source, "oidc"),
            inArray(schema.teamTable.id, requested),
          ),
        );
      const authoritative = eligible.map((team) => team.id);
      if (!authoritative.length) continue;
      const current = await tx
        .select({ teamId: schema.teamMemberTable.teamId })
        .from(schema.teamMemberTable)
        .where(
          and(
            eq(schema.teamMemberTable.userId, userId),
            inArray(schema.teamMemberTable.teamId, authoritative),
          ),
        );
      const desired = config.roleMappings
        .filter(
          (item) => roles.has(item.role) && authoritative.includes(item.teamId),
        )
        .map((item) => item.teamId);
      const changes = reconcileMappedTeamIds(
        current.map((item) => item.teamId),
        authoritative,
        desired,
      );
      if (changes.remove.length)
        await tx
          .delete(schema.teamMemberTable)
          .where(
            and(
              eq(schema.teamMemberTable.userId, userId),
              inArray(schema.teamMemberTable.teamId, changes.remove),
            ),
          );
      if (changes.add.length)
        await tx.insert(schema.teamMemberTable).values(
          changes.add.map((teamId) => ({
            id: createId(),
            teamId,
            userId,
            createdAt: new Date(),
          })),
        );
    }
  });
}
