import type { Sql } from "postgres";
import { agentPrincipalId, humanPrincipalId } from "./auth";

// STL-15 §2 authorization model (rework c4, defect 2): effective agent
// capability = membership/dynamic-role capability INTERSECT key ceiling
// INTERSECT structural grant. Humans use membership role capability plus
// structural grant. An agent key NEVER inherits its owner's human
// membership authority; only the intersection of its own identity_grant
// capabilities with the key permission ceiling applies.

export interface PrincipalContext {
	readonly principalId: string;
	readonly kind: "human" | "agent";
	readonly userId: string;
	/** Agent keys only: parsed permission ceiling from the key row. */
	readonly keyCeiling?: Readonly<Record<string, readonly string[]>> | null;
	/** Agent keys only: the apikey row id. */
	readonly apikeyId?: string;
}

/** Role name -> granted capability set. Static roles mirror the built-in
 * better-auth organization roles; dynamic roles (organization_role rows)
 * REPLACE defaults rather than union them (§2). */
function staticRoleCapabilities(role: string): ReadonlySet<string> {
	switch (role) {
		case "owner":
		case "admin":
			return new Set([
				"organization:read",
				"organization:update",
				"organization:manage_settings",
				"organization:manage_connections",
				"organization:manage_members",
				"member:read",
				"member:create",
				"member:update",
				"member:delete",
				"invitation:read",
				"invitation:create",
				"invitation:update",
				"team:read",
				"team:create",
				"team:update",
				"team:delete",
				"apikey:read",
				"apikey:create",
				"apikey:delete",
			]);
		case "member":
			return new Set([
				"organization:read",
				"member:read",
				"team:read",
				"apikey:read",
				"apikey:create",
				"apikey:delete",
			]);
		default:
			return new Set(["organization:read", "member:read", "team:read"]);
	}
}

export function roleCapabilities(
	role: string,
	dynamicRoles: ReadonlyMap<
		string,
		Readonly<Record<string, readonly string[]>>
	>,
): ReadonlySet<string> {
	const dynamic = dynamicRoles.get(role);
	if (dynamic) {
		const caps = new Set<string>();
		for (const [resource, actions] of Object.entries(dynamic)) {
			for (const action of actions) caps.add(`${resource}:${action}`);
		}
		return caps;
	}
	return staticRoleCapabilities(role);
}

/** Parse a key permission ceiling; null when absent/unparseable (§3
 * ApiKeyPublic explicit empty-ceiling semantics handled by callers). */
export function parseKeyCeiling(
	permissions: string | null,
): Readonly<Record<string, readonly string[]>> | null {
	if (permissions === null || permissions === undefined) return null;
	try {
		const parsed: unknown = JSON.parse(permissions);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const out: Record<string, readonly string[]> = {};
			for (const [resource, actions] of Object.entries(
				parsed as Record<string, unknown>,
			)) {
				if (!Array.isArray(actions)) continue;
				out[resource] = actions.filter(
					(a): a is string => typeof a === "string",
				);
			}
			return out;
		}
		return null;
	} catch {
		return null;
	}
}

async function loadDynamicRoles(
	sql: Sql,
	orgId: string,
): Promise<
	ReadonlyMap<string, Readonly<Record<string, readonly string[]>>>
> {
	const rows = await sql<{ role: string; permission: string }[]>`
		SELECT role, permission FROM organization_role WHERE organization_id = ${orgId}`;
	const map = new Map<
		string,
		Readonly<Record<string, readonly string[]>>
	>();
	for (const row of rows) {
		try {
			const parsed: unknown = JSON.parse(row.permission);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				const payload: Record<string, readonly string[]> = {};
				for (const [resource, actions] of Object.entries(
					parsed as Record<string, unknown>,
				)) {
					if (!Array.isArray(actions)) continue;
					payload[resource] = actions.filter(
						(a): a is string => typeof a === "string",
					);
				}
				map.set(row.role, payload);
			}
		} catch {
			// malformed permission row is not a capability source
		}
	}
	return map;
}

/** Effective capability set for one org: membership ∩ key ceiling ∩
 * structural identity_grant. Agents never consult human membership. */
export async function effectiveCapabilities(
	sql: Sql,
	ctx: PrincipalContext,
	orgId: string,
): Promise<ReadonlySet<string>> {
	const grants = await sql<{ capability: string }[]>`
		SELECT capability FROM identity_grant
		WHERE org_id = ${orgId} AND principal_id = ${ctx.principalId}`;
	const structural = new Set(grants.map((g) => g.capability));

	if (ctx.kind === "agent") {
		const ceiling = ctx.keyCeiling ?? {};
		const caps = new Set<string>();
		// The ceiling says what the key MAY do; structural grants say what
		// it was granted. Both must agree (intersection, never union).
		for (const [resource, actions] of Object.entries(ceiling)) {
			for (const action of actions) {
				const cap = `${resource}:${action}`;
				if (structural.has(cap)) caps.add(cap);
			}
		}
		if (caps.size > 0) caps.add("org:member");
		return caps;
	}

	const [member] = await sql<{ role: string }[]>`
		SELECT role FROM organization_member
		WHERE organization_id = ${orgId} AND user_id = ${ctx.userId}`;
	if (!member) return new Set();
	const dynamic = await loadDynamicRoles(sql, orgId);
	const roleCaps = roleCapabilities(member.role, dynamic);
	const caps = new Set<string>();
	for (const cap of roleCaps) if (structural.has(cap)) caps.add(cap);
	if (structural.has("org:member")) caps.add("org:member");
	return caps;
}

export function has(caps: ReadonlySet<string>, capability: string): boolean {
	return caps.has(capability);
}

export { agentPrincipalId, humanPrincipalId };
