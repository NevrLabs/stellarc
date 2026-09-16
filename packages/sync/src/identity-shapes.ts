import type { Sql } from "postgres";
import { key } from "../../contracts/src/shape";

// STL-15 §4 (review c9 defect 1): the nine identity public projections as
// org-scoped shapes on the stock /orgs/:org/v1/shape endpoint. Never raw SQL
// table access — each projection is an explicit SELECT with the org
// predicate, snake_case→camelCase mapping, and secret-column omission
// (no apikey digest, no organization secret, no hashes, no bytes).
//
// Tail events for each table map through the identity event vocabulary
// (identity:<entity>-upserted / -deleted, schema_version 1).

/** snake_case → camelCase for projection rows. */
function camel(name: string): string {
	return name.replaceAll(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		if (v instanceof Date) out[camel(k)] = v.toISOString();
		else out[camel(k)] = v;
	}
	return out;
}

function rowMapper<T extends Record<string, unknown>>(
	columns: readonly string[],
): (row: T) => Record<string, unknown> {
	const allowed = new Set(columns);
	return (row) =>
		mapRow(
			Object.fromEntries(Object.entries(row).filter(([k]) => allowed.has(k))),
		);
}

// --- The nine projections -------------------------------------------------
// Columns mirror the §3 Public row Schemas (contracts/src/identity/http.ts):
// UserPublic, OrganizationPublic (no aiProviderApiKey), MemberPublic,
// RolePublic (permission parsed), TeamPublic, TeamMemberPublic,
// InvitationPublic, ApiKeyPublic (no key/userId), PrincipalPublic.

export function identityShapeDefs(sql: Sql): Map<
	string,
	{
		events: readonly string[];
		pk: string;
		snapshot: (org: string) => Promise<Array<Record<string, unknown>>>;
	}
> {
	const defs = new Map<
		string,
		{
			events: readonly string[];
			pk: string;
			snapshot: (org: string) => Promise<Array<Record<string, unknown>>>;
		}
	>();

	const orgCols = [
		"id",
		"name",
		"slug",
		"repos_enabled",
		"tables_enabled",
		"work_enabled",
		"default_resource_privilege",
		"ai_enabled",
		"ai_default_token_limit",
		"ai_default_character_limit",
		"ai_provider_base_url",
		"ai_provider_model",
	];
	defs.set("organization", {
		events: ["identity:organization-upserted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql<
				Array<Record<string, unknown>>
			>`SELECT ${sql.unsafe(orgCols.join(", "))} FROM organization WHERE id = ${org}`;
			return rows.map(rowMapper(orgCols) as never);
		},
	});

	const memberCols = ["id", "organization_id", "user_id", "role", "joined_at"];
	defs.set("organization_member", {
		events: ["identity:member-upserted", "identity:member-deleted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT m.id, m.organization_id, m.user_id, m.role, m.joined_at,
					u.name AS user_name, u.email AS user_email, u.image AS user_image
				FROM organization_member m
				JOIN "user" u ON u.id = m.user_id
				WHERE m.organization_id = ${org} ORDER BY m.id`;
			return rows.map((row) => {
				const base = mapRow(
					Object.fromEntries(
						Object.entries(row as Record<string, unknown>).filter(([k]) =>
							memberCols.includes(k),
						),
					),
				);
				return {
					...base,
					user: {
						id: row.user_id,
						name: row.user_name,
						email: row.user_email,
						image: row.user_image,
					},
				};
			});
		},
	});

	const roleCols = [
		"id",
		"organization_id",
		"role",
		"permission",
		"created_at",
		"updated_at",
	];
	defs.set("organization_role", {
		events: ["identity:role-upserted", "identity:role-deleted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT ${sql.unsafe(roleCols.join(", "))} FROM organization_role
				WHERE organization_id = ${org} ORDER BY id`;
			return rows.map((row) => {
				const mapped = rowMapper(roleCols)(row as Record<string, unknown>);
				let permission: unknown = (row as { permission?: unknown }).permission;
				if (typeof permission === "string") {
					try {
						permission = JSON.parse(permission);
					} catch {
						permission = {};
					}
				}
				mapped.permission = permission;
				return mapped;
			});
		},
	});

	const teamCols = [
		"id",
		"name",
		"organization_id",
		"source",
		"icon",
		"parent_team_id",
		"created_at",
		"updated_at",
	];
	defs.set("team", {
		events: ["identity:team-upserted", "identity:team-deleted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT ${sql.unsafe(teamCols.join(", "))} FROM team
				WHERE organization_id = ${org} ORDER BY id`;
			return rows.map(rowMapper(teamCols) as never);
		},
	});

	const teamMemberCols = ["id", "team_id", "user_id", "created_at"];
	defs.set("team_member", {
		events: ["identity:team-member-upserted", "identity:team-member-deleted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT tm.id, tm.team_id, tm.user_id, tm.created_at, t.organization_id
				FROM team_member tm JOIN team t ON t.id = tm.team_id
				WHERE t.organization_id = ${org} ORDER BY tm.id`;
			return rows.map(
				rowMapper([...teamMemberCols, "organization_id"]) as never,
			);
		},
	});

	const invitationCols = [
		"id",
		"organization_id",
		"email",
		"role",
		"team_id",
		"status",
		"expires_at",
		"created_at",
		"inviter_id",
	];
	defs.set("invitation", {
		events: ["identity:invitation-upserted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT ${sql.unsafe(invitationCols.join(", "))} FROM invitation
				WHERE organization_id = ${org} ORDER BY id`;
			return rows.map(rowMapper(invitationCols) as never);
		},
	});

	// ApiKeyPublic: no key digest, no userId (§3 omits the legacy duplicate).
	const apikeyCols = [
		"id",
		"config_id",
		"name",
		"permissions",
		"enabled",
		"expires_at",
		"request_count",
		"remaining",
		"last_request",
		"created_at",
		"updated_at",
	];
	defs.set("apikey", {
		events: ["identity:apikey-upserted", "identity:apikey-deleted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT ${sql.unsafe(apikeyCols.join(", "))} FROM apikey
				WHERE id IN (SELECT apikey_id FROM identity_grant g
					JOIN principal p ON p.id = g.principal_id
					WHERE g.org_id = ${org})
				ORDER BY id`;
			return rows.map((row) => {
				const mapped = rowMapper(apikeyCols)(row as Record<string, unknown>);
				let permissions: unknown = (row as { permissions?: unknown })
					.permissions;
				if (typeof permissions === "string") {
					try {
						permissions = JSON.parse(permissions);
					} catch {
						permissions = {};
					}
				}
				mapped.permissions = permissions;
				return mapped;
			});
		},
	});

	const principalCols = ["id", "kind", "user_id", "apikey_id"];
	defs.set("principal", {
		events: ["identity:principal-upserted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT p.id, p.kind, p.user_id, p.apikey_id FROM principal p
				WHERE EXISTS (SELECT 1 FROM identity_grant g
					WHERE g.principal_id = p.id AND g.org_id = ${org})
				ORDER BY p.id`;
			return rows.map(rowMapper(principalCols) as never);
		},
	});

	const userCols = [
		"id",
		"name",
		"email",
		"email_verified",
		"image",
		"created_at",
		"updated_at",
	];
	defs.set("user", {
		events: ["identity:user-upserted"],
		pk: "id",
		snapshot: async (org) => {
			const rows = await sql`
				SELECT ${sql.unsafe(userCols.join(", "))} FROM "user" u
				WHERE EXISTS (SELECT 1 FROM organization_member m
					WHERE m.user_id = u.id AND m.organization_id = ${org})
				ORDER BY u.id`;
			return rows.map(rowMapper(userCols) as never);
		},
	});

	return defs;
}

/**
 * Hydrate the current public row for a tail event. Events carry ids; the
 * row is read at delivery time so the tail never serves stale payloads
 * and deleted rows naturally produce a tombstone.
 */
export async function hydrateIdentityRow(
	def: {
		events: readonly string[];
		pk: string;
		snapshot: (org: string) => Promise<Array<Record<string, unknown>>>;
	},
	org: string,
	pk: string,
): Promise<Record<string, unknown> | undefined> {
	const rows = await def.snapshot(org);
	return rows.find((row) => String(row[def.pk]) === pk);
}

/** Wire type for the Electric message shape (relation per table). */
export function identityRelation(table: string): [string, string] {
	return ["public", table];
}

export { key, camel as camelCase };
