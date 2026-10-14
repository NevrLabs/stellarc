/**
 * Production MCP permission guards - the Effect port of kaneo-legacy
 * src/mcp/permissions.ts.
 *
 * Legacy resolves the organization behind a task/board id, then reuses the
 * HTTP API's organization-permission rules (hasOrganizationPermission) before
 * the tool issues any request. The Effect port maps that onto kernel
 * Access.requirePermission (same rules: non-agent keys must satisfy the key
 * scope, instance admins pass, otherwise org-role statements must satisfy the
 * required permission map), with the caller from McpRequestPrincipal.
 *
 * Failures fail the tool as ApiError - the tool wrapper renders them as
 * isError results, exactly how legacy McpPermissionError rejections reached
 * the client. A guard with no principal is a no-op (legacy parity: userId
 * unknown -> guard passes, the session token still gates the HTTP call).
 */

import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { Access, CurrentUser, Db, type Principal, schema } from "../kernel";
import { ApiError, type McpGuards, McpRequestPrincipal } from "./tools";

const DENIED = "Forbidden: missing required permission.";
const NO_ORG = "Resource not found or not accessible to this user.";

/** task -> board -> organizationId (getOrganizationIdForTask). */
const orgForTask = Effect.fn("mcp.orgForTask")(function* (taskId: string) {
	const db = yield* Db;
	const rows = yield* Effect.promise(() =>
		db
			.select({ organizationId: schema.boardTable.organizationId })
			.from(schema.taskTable)
			.innerJoin(
				schema.boardTable,
				eq(schema.taskTable.boardId, schema.boardTable.id),
			)
			.where(eq(schema.taskTable.id, taskId))
			.limit(1),
	);
	return rows[0]?.organizationId ?? null;
});

/** board -> organizationId (getOrganizationIdForBoard). */
const orgForBoard = Effect.fn("mcp.orgForBoard")(function* (boardId: string) {
	const db = yield* Db;
	const rows = yield* Effect.promise(() =>
		db
			.select({ organizationId: schema.boardTable.organizationId })
			.from(schema.boardTable)
			.where(eq(schema.boardTable.id, boardId))
			.limit(1),
	);
	return rows[0]?.organizationId ?? null;
});

/** Shared check: resolve org, then apply the HTTP permission rules. */
const guard = Effect.fn("mcp.guard")(function* (
	required: Record<string, string[]>,
	resolveOrg: Effect.Effect<string | null, never, Db | McpRequestPrincipal>,
) {
	const me = yield* McpRequestPrincipal;
	if (!me) return;
	const organizationId = yield* resolveOrg;
	if (!organizationId) return yield* new ApiError({ message: NO_ORG });
	const access = yield* Access;
	// Same principal shape AuthenticationLive provides the HTTP handlers;
	// apiKey is null because MCP keys are pre-resolved to their userId.
	const principal: Principal = {
		userId: me.userId,
		userRole: me.userRole,
		apiKey: null,
	};
	yield* access.requirePermission(organizationId, required).pipe(
		Effect.provideService(CurrentUser, principal),
		Effect.catchTag("Forbidden", () =>
			Effect.fail(new ApiError({ message: DENIED })),
		),
	);
});

/** Guards with the same shape the tool registry imports (McpGuards). */
export const mcpGuardsLive = (): McpGuards => ({
	guardTask: (taskId, permissions) =>
		guard(permissions, orgForTask(taskId)) as never,
	guardBoard: (boardId, permissions) =>
		guard(permissions, orgForBoard(boardId)) as never,
});
