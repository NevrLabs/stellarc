import { eq } from "drizzle-orm";
import type { Context } from "hono";
import db, { schema } from "../database";
import { hasOrganizationPermission } from "../utils/require-organization-permission";

/**
 * Permission enforcement for MCP task tools (#38).
 *
 * MCP tools are invoked outside the Hono request pipeline, so the
 * `organizationAccess` / `requireOrganizationPermission` middlewares cannot be
 * mounted directly. Rather than reimplement the rules (and drift from the HTTP
 * API), we reuse `hasOrganizationPermission` verbatim by handing it a minimal
 * context carrying the same `userId` / `organizationId` keys the middleware
 * would have set. A tool that skips this check is a privilege-escalation bug.
 */
export type McpPermissionMap = Record<string, string[]>;

export class McpPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpPermissionError";
  }
}

function permissionContext(userId: string, organizationId: string): Context {
  const values: Record<string, unknown> = { userId, organizationId };
  return {
    get: (key: string) => values[key],
    set: (key: string, value: unknown) => {
      values[key] = value;
    },
  } as unknown as Context;
}

/** Resolve the organization owning a board. */
export async function getOrganizationIdForBoard(
  boardId: string,
): Promise<string | null> {
  const [board] = await db
    .select({ organizationId: schema.boardTable.organizationId })
    .from(schema.boardTable)
    .where(eq(schema.boardTable.id, boardId))
    .limit(1);
  return board?.organizationId ?? null;
}

/** Resolve the organization owning a task, via its board. */
export async function getOrganizationIdForTask(
  taskId: string,
): Promise<string | null> {
  const [task] = await db
    .select({ organizationId: schema.boardTable.organizationId })
    .from(schema.taskTable)
    .innerJoin(
      schema.boardTable,
      eq(schema.taskTable.boardId, schema.boardTable.id),
    )
    .where(eq(schema.taskTable.id, taskId))
    .limit(1);
  return task?.organizationId ?? null;
}

/**
 * Throws unless `userId` holds every requested permission in `organizationId`.
 */
export async function assertMcpPermission(
  userId: string,
  organizationId: string | null,
  permissions: McpPermissionMap,
): Promise<void> {
  if (!userId) {
    throw new McpPermissionError("Unauthorized: no user for this MCP session.");
  }
  if (!organizationId) {
    throw new McpPermissionError(
      "Resource not found or not accessible to this user.",
    );
  }

  const allowed = await hasOrganizationPermission(
    permissionContext(userId, organizationId),
    permissions,
  );

  if (!allowed) {
    const described = Object.entries(permissions)
      .map(([resource, actions]) => `${resource}:${actions.join(",")}`)
      .join(" ");
    throw new McpPermissionError(
      `Forbidden: missing required permission (${described}).`,
    );
  }
}

/** Guard for tools addressed by task id. */
export async function assertTaskPermission(
  userId: string,
  taskId: string,
  permissions: McpPermissionMap,
): Promise<string> {
  const organizationId = await getOrganizationIdForTask(taskId);
  await assertMcpPermission(userId, organizationId, permissions);
  return organizationId as string;
}

/** Guard for tools addressed by board id. */
export async function assertBoardPermission(
  userId: string,
  boardId: string,
  permissions: McpPermissionMap,
): Promise<string> {
  const organizationId = await getOrganizationIdForBoard(boardId);
  await assertMcpPermission(userId, organizationId, permissions);
  return organizationId as string;
}
