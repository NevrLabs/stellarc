import { type BuiltInRoleName, builtInRoles } from "@kaneo/permissions";
import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { isInstanceAdmin } from "./is-instance-admin";

type PermissionMap = Record<string, string[]>;

type ApiKeyAuthorization = {
  permissions?: Record<string, string[]> | null;
  metadata?: { type?: string } | null;
};

export function isAgentApiKey(
  apiKey: ApiKeyAuthorization | undefined,
): boolean {
  return apiKey?.metadata?.type === "agent";
}

function builtInRoleStatements(
  role: string,
): Record<string, readonly string[]> | null {
  if (role in builtInRoles) {
    return builtInRoles[role as BuiltInRoleName].statements as Record<
      string,
      readonly string[]
    >;
  }
  return null;
}

function parsePermissionStatements(
  raw: string,
): Record<string, readonly string[]> | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  // Only keep entries shaped like { [resource: string]: string[] }.
  // Anything malformed is dropped so `satisfies()` never calls
  // `.includes()` on a non-array.
  const result: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(actions)) continue;
    const filtered = actions.filter(
      (action): action is string => typeof action === "string",
    );
    if (filtered.length > 0) {
      result[resource] = filtered;
    }
  }
  return result;
}

async function customRoleStatements(
  organizationId: string,
  role: string,
): Promise<Record<string, readonly string[]> | null> {
  const [row] = await db
    .select({ permission: schema.organizationRoleTable.permission })
    .from(schema.organizationRoleTable)
    .where(
      and(
        eq(schema.organizationRoleTable.organizationId, organizationId),
        eq(schema.organizationRoleTable.role, role),
      ),
    )
    .limit(1);

  if (!row?.permission) return null;

  return parsePermissionStatements(row.permission);
}

function satisfies(
  statements: Record<string, readonly string[]>,
  required: PermissionMap,
): boolean {
  for (const [resource, actions] of Object.entries(required)) {
    const granted = statements[resource];
    if (!granted) return false;
    for (const action of actions) {
      if (!granted.includes(action)) return false;
    }
  }
  return true;
}

export async function hasOrganizationPermission(
  c: Context,
  permissions: PermissionMap,
) {
  const organizationId = c.get("organizationId");
  if (!organizationId) return false;

  const apiKey = c.get("apiKey") as ApiKeyAuthorization | undefined;
  if (
    !isAgentApiKey(apiKey) &&
    apiKey?.permissions &&
    !satisfies(apiKey.permissions, permissions)
  ) {
    return false;
  }

  if (await isInstanceAdmin(c)) {
    return true;
  }

  const userId = c.get("userId");
  if (!userId) return false;

  const [member] = await db
    .select({ role: schema.organizationMemberTable.role })
    .from(schema.organizationMemberTable)
    .where(
      and(
        eq(schema.organizationMemberTable.organizationId, organizationId),
        eq(schema.organizationMemberTable.userId, userId),
      ),
    )
    .limit(1);

  if (!member?.role) return false;

  // Prefer the DB row when present so admin-edited defaults
  // (viewer/member/admin) take effect immediately. Falls back to the
  // compiled-in static definitions only when no row exists — protects
  // viewer/member/admin users from a 403 if their organization somehow
  // missed the seed (e.g., seed failed during organization creation and
  // the boot-time backfill hasn't run yet).
  const statements =
    (await customRoleStatements(organizationId, member.role)) ??
    builtInRoleStatements(member.role);

  return Boolean(statements && satisfies(statements, permissions));
}

export function requireOrganizationPermission(permissions: PermissionMap) {
  return async (c: Context, next: Next) => {
    if (!c.get("organizationId")) {
      throw new HTTPException(500, {
        message: "organizationId not set in context",
      });
    }

    const apiKey = c.get("apiKey") as ApiKeyAuthorization | undefined;
    // Agent keys authenticate a first-class organization member. Their
    // organization role is the authority, exactly as it is for a human user;
    // the legacy key permission map must not become a second ACL. Non-agent
    // API keys remain scope-limited.
    if (
      !isAgentApiKey(apiKey) &&
      apiKey?.permissions &&
      !satisfies(apiKey.permissions, permissions)
    ) {
      throw new HTTPException(403, { message: "Insufficient API key scope" });
    }

    if (!(await hasOrganizationPermission(c, permissions))) {
      if (!c.get("userId")) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }

    return next();
  };
}
