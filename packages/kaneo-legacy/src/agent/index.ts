import { createHash, randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

/*
 * Agents are first-class members: a human user and an agent user are treated
 * identically, and access is decided by the member's ROLE via
 * `resource-access.ts` — not by what kind of principal is asking.
 *
 * This used to be a hardcoded allowlist that capped agents at
 * board/task read+create+update, label read and organization read. That
 * silently denied an agent things its own role permits (deleting a task,
 * managing labels, anything team-scoped) even when it was an organization
 * owner. The vocabulary below is therefore descriptive, not restrictive: it
 * lists the resources and actions that exist so a typo is still rejected, and
 * every action a role can perform is available to an agent holding that role.
 */
export const RESOURCE_ACTIONS = ["read", "create", "update", "delete"] as const;
export const KNOWN_RESOURCES = [
  "board",
  "task",
  "label",
  "organization",
  "team",
  "milestone",
  "comment",
] as const;
const MAX_EXPIRY_DAYS = 365;

type AgentMetadata = {
  type: "agent";
  organizationId: string;
  createdBy: string;
  agentUserId: string;
};

function metadata(row: { metadata: string | null }): AgentMetadata | null {
  try {
    const value = JSON.parse(row.metadata ?? "null") as Partial<AgentMetadata>;
    return value.type === "agent" && typeof value.organizationId === "string"
      ? (value as AgentMetadata)
      : null;
  } catch {
    return null;
  }
}

async function requireAdmin(userId: string, organizationId: string) {
  const [member] = await db
    .select({ role: schema.organizationMemberTable.role })
    .from(schema.organizationMemberTable)
    .where(
      and(
        eq(schema.organizationMemberTable.userId, userId),
        eq(schema.organizationMemberTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new HTTPException(403, {
      message: "Organization admin access required",
    });
  }
}

export function validatePermissions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HTTPException(400, {
      message: "Explicit permissions are required",
    });
  }
  const result: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      !(KNOWN_RESOURCES as readonly string[]).includes(resource) ||
      !Array.isArray(actions) ||
      actions.length === 0 ||
      actions.some(
        (action) =>
          typeof action !== "string" ||
          !(RESOURCE_ACTIONS as readonly string[]).includes(action),
      )
    ) {
      throw new HTTPException(400, {
        message: `Invalid agent permission: ${resource}`,
      });
    }
    result[resource] = [...new Set(actions as string[])];
  }
  if (Object.keys(result).length === 0)
    throw new HTTPException(400, {
      message: "At least one permission is required",
    });
  return result;
}

const agent = new Hono<{ Variables: { userId: string } }>();

agent.get("/", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId)
    throw new HTTPException(400, { message: "organizationId is required" });
  await requireAdmin(c.get("userId"), organizationId);
  const rows = await db
    .select()
    .from(schema.apikeyTable)
    .orderBy(desc(schema.apikeyTable.createdAt));
  return c.json(
    rows
      .filter((row) => metadata(row)?.organizationId === organizationId)
      .map((row) => ({
        id: row.id,
        name: row.name,
        start: row.start,
        enabled: row.enabled,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        permissions: row.permissions ? JSON.parse(row.permissions) : {},
        type: "agent" as const,
      })),
  );
});

agent.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const expiresAt =
    typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
  const userId = c.get("userId");
  if (
    !organizationId ||
    name.length < 3 ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= new Date() ||
    expiresAt.getTime() > Date.now() + MAX_EXPIRY_DAYS * 86400000
  ) {
    throw new HTTPException(400, {
      message: "Name and an expiry within 365 days are required",
    });
  }
  await requireAdmin(userId, organizationId);
  const permissions = validatePermissions(body.permissions);
  const secret = `kaneo_agent_${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  const agentUserId = createId();
  const created = await db.transaction(async (tx) => {
    await tx.insert(schema.userTable).values({
      id: agentUserId,
      name,
      email: `agent-${agentUserId}@agents.invalid`,
      emailVerified: false,
      role: "agent",
    });
    await tx.insert(schema.organizationMemberTable).values({
      id: createId(),
      organizationId,
      userId: agentUserId,
      role: "member",
      joinedAt: now,
    });
    const [key] = await tx
      .insert(schema.apikeyTable)
      .values({
        id: createId(),
        name,
        start: secret.slice(0, 16),
        referenceId: agentUserId,
        key: createHash("sha256").update(secret).digest("base64url"),
        enabled: true,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        permissions: JSON.stringify(permissions),
        metadata: JSON.stringify({
          type: "agent",
          organizationId,
          createdBy: userId,
          agentUserId,
        } satisfies AgentMetadata),
      })
      .returning();
    return key;
  });
  return c.json(
    {
      id: created.id,
      name,
      key: secret,
      start: created.start,
      expiresAt,
      permissions,
      type: "agent",
    },
    201,
  );
});

agent.delete("/:id", async (c) => {
  const [row] = await db
    .select()
    .from(schema.apikeyTable)
    .where(eq(schema.apikeyTable.id, c.req.param("id")))
    .limit(1);
  const agentMetadata = row && metadata(row);
  if (!row || !agentMetadata)
    throw new HTTPException(404, { message: "Agent not found" });
  await requireAdmin(c.get("userId"), agentMetadata.organizationId);
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.apikeyTable)
      .where(eq(schema.apikeyTable.id, row.id));
    if (agentMetadata.agentUserId) {
      await tx
        .delete(schema.userTable)
        .where(eq(schema.userTable.id, agentMetadata.agentUserId));
    }
  });
  return c.json({ success: true });
});

export default agent;
