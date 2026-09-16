import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { humanPrincipalId } from "./auth";

// STL-15 §2 mutations: every domain write, projection row and event commits
// atomically on one connection. Org-scoped mutations take a transaction
// advisory lock on the org (T14) so concurrent last-owner removals serialize.
// Events carry sanitized public rows only — no secrets, no hashes, no bytes.

export interface Failure {
	readonly _tag: "Conflict" | "NotFound" | "Unauthenticated" | "Forbidden";
	readonly code?: string;
}

function forbidden(): Failure {
	return { _tag: "Forbidden" };
}

function deterministicId(prefix: string, parts: string[]): string {
	const hash = createHash("sha256")
		.update(parts.join("\u001f"))
		.digest("base64url");
	return `${prefix}_${hash.slice(0, 24)}`;
}

function randomId(prefix: string): string {
	return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function conflict(code: string): Failure {
	return { _tag: "Conflict", code };
}

function notFound(): Failure {
	return { _tag: "NotFound" };
}

async function lockOrg(tx: Sql, orgId: string): Promise<void> {
	await tx`SELECT pg_advisory_xact_lock(hashtext(${`org:${orgId}`}))`;
}

interface EventInsert {
	type: string;
	payload: Record<string, unknown>;
}

export async function appendEvents(
	tx: Sql,
	org: string,
	actor: string,
	list: EventInsert[],
): Promise<number> {
	if (list.length === 0) return 0;
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] = await tx<{ seq: string }[]>`
		UPDATE org_event_counter SET seq = seq + ${list.length} WHERE org = ${org}
		RETURNING seq::text`;
	const [xact] = await tx<{ txid: string }[]>`
		SELECT pg_current_xact_id()::text AS txid`;
	const txid = Number(BigInt(xact.txid));
	let seq = BigInt(counter.seq) - BigInt(list.length);
	for (const event of list) {
		seq += 1n;
		await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
			VALUES (${org}, ${seq.toString()}, ${event.type}, ${actor}, ${tx.json(event.payload as never)}, 1, ${xact.txid})`;
	}
	return txid;
}

export interface CreateOrganizationInput {
	name: string;
	slug: string;
	description?: string;
}

export interface MutationResult {
	data: Record<string, unknown>;
	txid: number;
}

export async function createOrganization(
	sql: Sql,
	creatorUserId: string,
	input: CreateOrganizationInput,
): Promise<MutationResult> {
	const slug = input.slug;
	const orgId = deterministicId("org", [slug]);
	const memberId = deterministicId("member", [orgId, creatorUserId]);
	const now = new Date();
	try {
		return await sql.begin(async (tx) => {
			await lockOrg(tx, orgId);
			const [existing] =
				await tx`SELECT id FROM organization WHERE lower(slug) = lower(${slug})`;
			if (existing) throw conflict("Duplicate");
			const [slugTaken] =
				await tx`SELECT id FROM organization WHERE slug = ${slug}`;
			if (slugTaken) throw conflict("Duplicate");
			await tx`INSERT INTO organization (id, name, slug, description, repos_enabled, tables_enabled, work_enabled, default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
				VALUES (${orgId}, ${input.name}, ${slug}, ${input.description ?? null}, false, false, false, 'manage', false, 1024, 4000, ${now})`;
			await tx`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
				VALUES (${memberId}, ${orgId}, ${creatorUserId}, 'owner', ${now})`;
			const principalId = humanPrincipalId(creatorUserId);
			await tx`INSERT INTO principal (id, kind, user_id, apikey_id)
				VALUES (${principalId}, 'human', ${creatorUserId}, null)
				ON CONFLICT (id) DO NOTHING`;
			// Defect 7: seed the FULL owner capability set so the fresh org's
			// owner is never locked out (humans = role ∪ structural, §2).
			for (const capability of OWNER_GRANT_CAPABILITIES_DERIVE) {
				await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
					VALUES (${orgId}, ${principalId}, ${capability})
					ON CONFLICT DO NOTHING`;
			}
			await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
				VALUES (${orgId}, ${principalId}, 'org:member')
				ON CONFLICT DO NOTHING`;
			const { defaultRolePayloads } = await import(
				"../../../contracts/src/legacy/permissions"
			);
			const roleEvents: EventInsert[] = [];
			for (const [roleName, permission] of Object.entries(
				defaultRolePayloads,
			)) {
				const roleId = deterministicId("role", [orgId, roleName]);
				await tx`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
					VALUES (${roleId}, ${orgId}, ${roleName}, ${JSON.stringify(permission)}, ${now}, ${now})`;
				roleEvents.push({
					type: "identity:role-upserted",
					payload: { id: roleId },
				});
			}
			const [orgRow] = await tx<Record<string, unknown>[]>`
				SELECT id, name, slug, description, created_at FROM organization WHERE id = ${orgId}`;
			const txid = await appendEvents(
				tx,
				orgId,
				humanPrincipalId(creatorUserId),
				[
					{
						type: "identity:organization-upserted",
						payload: { id: orgId, row: orgRow },
					},
					{
						type: "identity:member-upserted",
						payload: { id: memberId },
					},
					...roleEvents,
					{
						type: "identity:principal-upserted",
						payload: { id: principalId },
					},
					...OWNER_GRANT_CAPABILITIES_DERIVE.map((capability) => ({
						type: "identity:grant-upserted" as const,
						payload: { principalId, capability },
					})),
				],
			);
			return {
				data: {
					id: orgId,
					name: input.name,
					slug,
					logo: null,
					metadata: null,
					description: input.description ?? null,
					reposEnabled: false,
					tablesEnabled: false,
					workEnabled: false,
					defaultResourcePrivilege: "manage",
					aiEnabled: false,
					aiDefaultTokenLimit: 1024,
					aiDefaultCharacterLimit: 4000,
					aiProviderBaseUrl: null,
					aiProviderModel: null,
					// aiProviderApiKey deliberately omitted: §3 OrganizationPublic
					// allowlist never carries the provider secret.
					createdAt: now.toISOString(),
				} as unknown as Record<string, unknown>,
				txid,
			};
		});
	} catch (error) {
		if (error && typeof error === "object" && "_tag" in error) throw error;
		if (
			error instanceof Error &&
			error.message.includes("organization_slug_lower_unique")
		)
			throw conflict("Duplicate");
		throw error;
	}
}

export async function removeMember(
	sql: Sql,
	orgId: string,
	memberId: string,
	actorPrincipalId: string,
): Promise<MutationResult> {
	if (!actorPrincipalId) {
		// §3: mutations require an authenticated actor; authentication
		// establishes actor context before any mutation runs. The error is
		// the union's Unauthenticated member, never a Conflict code.
		const unauthenticated: Failure = { _tag: "Unauthenticated" };
		throw unauthenticated;
	}
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		// Review c1 defect 1: the org argument is an org ID or slug — resolve
		// it to the canonical org row so member scoping binds a real ID, and
		// an unresolvable org is the same NotFound as an absent member.
		const [org] =
			await tx`SELECT id FROM organization WHERE id = ${orgId} OR slug = ${orgId} OR lower(slug) = lower(${orgId})`;
		if (!org) throw notFound();
		const [member] =
			await tx`SELECT id, role, user_id FROM organization_member WHERE id = ${memberId} AND organization_id = ${org.id}`;
		if (!member) throw notFound();
		if (member.role === "owner") {
			const owners = await tx<{ n: number }[]>`
				SELECT count(*)::int AS n FROM organization_member
				WHERE organization_id = ${org.id} AND role = 'owner'`;
			if (Number(owners[0]?.n ?? 0) <= 1) throw conflict("LastOwner");
		}
		await tx`DELETE FROM organization_member WHERE id = ${memberId} AND organization_id = ${org.id}`;
		// Defect 6 (T12): revoke EVERY principal derived from this user —
		// the human principal and every agent principal minted from their
		// API keys — in the same transaction, with matching grant-deleted
		// events. Session and shape-handle authorization re-read these
		// rows per request, so access terminates now, not at cache expiry.
		const removed = await tx<{ principal_id: string; capability: string }[]>`
				DELETE FROM identity_grant WHERE org_id = ${org.id} AND principal_id IN
					(SELECT id FROM principal WHERE user_id = ${String(member.user_id)})
				RETURNING principal_id, capability`;
		// Events live in the org's canonical-ID namespace, exactly like
		// every other identity event — never under the caller's raw path.
		const txid = await appendEvents(tx, org.id, actorPrincipalId, [
			{ type: "identity:member-deleted", payload: { id: memberId } },
			...removed.map((row) => ({
				type: "identity:grant-deleted" as const,
				payload: {
					principalId: row.principal_id,
					capability: row.capability,
				},
			})),
		]);
		return { data: { id: memberId }, txid };
	});
}

// --- grant re-derivation helpers (rework c10 defects 7/13) -------------------

const OWNER_GRANT_CAPABILITIES_DERIVE: readonly string[] = [
	"org:member",
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
	"apikey:create",
	"apikey:update",
	"apikey:delete",
];

const MEMBER_GRANT_CAPABILITIES_DERIVE: readonly string[] = [
	"organization:read",
	"member:read",
	"team:read",
	"apikey:create",
	"apikey:update",
	"apikey:delete",
];

async function loadDynamicRolesForGrants(
	tx: Sql,
	orgId: string,
): Promise<ReadonlyMap<string, Readonly<Record<string, readonly string[]>>>> {
	const rows = await tx<{ role: string; permission: string }[]>`
		SELECT role, permission FROM organization_role WHERE organization_id = ${orgId}`;
	const map = new Map<string, Readonly<Record<string, readonly string[]>>>();
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
						(action): action is string => typeof action === "string",
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

/** Static-role capability derivation for grant re-computation (mirrors the
 * capabilities.ts static table; org:member is added by callers). */
function roleCapabilitiesForGrants(
	role: string,
	dynamicRoles: ReadonlyMap<
		string,
		Readonly<Record<string, readonly string[]>>
	>,
): readonly string[] {
	const dynamic = dynamicRoles.get(role);
	if (dynamic) {
		const caps: string[] = [];
		for (const [resource, actions] of Object.entries(dynamic)) {
			for (const action of actions) caps.push(`${resource}:${action}`);
		}
		return caps;
	}
	if (role === "owner" || role === "admin")
		return OWNER_GRANT_CAPABILITIES_DERIVE;
	if (role === "member") return MEMBER_GRANT_CAPABILITIES_DERIVE;
	return ["organization:read", "member:read", "team:read"];
}

export function newId(prefix: string): string {
	return randomId(prefix);
}

// --- rework c4 (D12): §3 write surface -----------------------------------------

type PermissionMap = Record<string, string[]>;

async function orgRoleRow(
	tx: Sql,
	orgId: string,
	roleId: string,
): Promise<RoleLike | null> {
	const [row] = await tx<RoleLike[]>`
		SELECT id, organization_id, role, permission, created_at, updated_at
		FROM organization_role WHERE id = ${roleId} AND organization_id = ${orgId}`;
	return row ?? null;
}

interface RoleLike {
	id: string;
	organization_id: string;
	role: string;
	permission: string;
	created_at: Date | string;
	updated_at: Date | string;
}

export async function updateMemberRole(
	sql: Sql,
	orgId: string,
	memberId: string,
	role: string,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [member] = await tx`SELECT id, role FROM organization_member
			WHERE id = ${memberId} AND organization_id = ${orgId}`;
		if (!member) throw notFound();
		if (member.role === "owner" && role !== "owner") {
			const owners = await tx<{ n: number }[]>`
				SELECT count(*)::int AS n FROM organization_member
				WHERE organization_id = ${orgId} AND role = 'owner'`;
			if (Number(owners[0]?.n ?? 0) <= 1) throw conflict("LastOwner");
		}
		await tx`UPDATE organization_member SET role = ${role} WHERE id = ${memberId} AND organization_id = ${orgId}`;
		const [row] = await tx<
			{
				id: string;
				organization_id: string;
				user_id: string;
				role: string;
				ai_token_limit: number | null;
				ai_character_limit: number | null;
				joined_at: Date | string;
			}[]
		>`SELECT id, organization_id, user_id, role, ai_token_limit, ai_character_limit, joined_at
			FROM organization_member WHERE id = ${memberId}`;
		const principalId = humanPrincipalId(String(row.user_id));
		// Defect 13: role change re-derives the user's grant set in the same
		// transaction (grant-upserted/deleted events), so member-role → grant
		// drift never occurs and consumers see the new powers immediately.
		const dynamic = await loadDynamicRolesForGrants(tx, orgId);
		const wanted = new Set<string>([
			...roleCapabilitiesForGrants(role, dynamic),
			"org:member",
		]);
		const existing = await tx<{ capability: string }[]>`
			SELECT capability FROM identity_grant
			WHERE org_id = ${orgId} AND principal_id = ${principalId}`;
		const existingSet = new Set(existing.map((row) => row.capability));
		const grantEvents: EventInsert[] = [];
		for (const capability of wanted) {
			if (existingSet.has(capability)) continue;
			await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
				VALUES (${orgId}, ${principalId}, ${capability})
				ON CONFLICT DO NOTHING`;
			grantEvents.push({
				type: "identity:grant-upserted",
				payload: { principalId, capability },
			});
		}
		for (const capability of existingSet) {
			if (wanted.has(capability)) continue;
			await tx`DELETE FROM identity_grant
				WHERE org_id = ${orgId} AND principal_id = ${principalId} AND capability = ${capability}`;
			grantEvents.push({
				type: "identity:grant-deleted",
				payload: { principalId, capability },
			});
		}
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:member-upserted", payload: { id: memberId } },
			...grantEvents,
		]);
		return {
			data: {
				id: row.id,
				organizationId: row.organization_id,
				userId: row.user_id,
				role: row.role,
				aiTokenLimit: row.ai_token_limit,
				aiCharacterLimit: row.ai_character_limit,
				joinedAt: toIsoRow(row.joined_at),
				principalId,
			},
			txid,
		};
	});
}

function toIsoRow(value: Date | string | null): string {
	if (value instanceof Date) return value.toISOString();
	return String(value ?? "");
}

export async function createRole(
	sql: Sql,
	orgId: string,
	input: { role: string; permission: PermissionMap },
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [dupe] = await tx`SELECT id FROM organization_role
			WHERE organization_id = ${orgId} AND role = ${input.role}`;
		if (dupe) throw conflict("Duplicate");
		const roleId = newId("role");
		const now = new Date();
		await tx`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
			VALUES (${roleId}, ${orgId}, ${input.role}, ${JSON.stringify(input.permission)}, ${now}, ${now})`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:role-upserted", payload: { id: roleId } },
		]);
		return {
			data: {
				id: roleId,
				organizationId: orgId,
				role: input.role,
				permission: input.permission,
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
			},
			txid,
		};
	});
}

export async function updateRole(
	sql: Sql,
	orgId: string,
	roleId: string,
	permission: PermissionMap,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const existing = await orgRoleRow(tx, orgId, roleId);
		if (!existing) throw notFound();
		const now = new Date();
		await tx`UPDATE organization_role SET permission = ${JSON.stringify(permission)}, updated_at = ${now}
			WHERE id = ${roleId} AND organization_id = ${orgId}`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:role-upserted", payload: { id: roleId } },
		]);
		return {
			data: {
				id: roleId,
				organizationId: orgId,
				role: existing.role,
				permission,
				createdAt: toIsoRow(existing.created_at),
				updatedAt: now.toISOString(),
			},
			txid,
		};
	});
}

export async function deleteRole(
	sql: Sql,
	orgId: string,
	roleId: string,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const existing = await orgRoleRow(tx, orgId, roleId);
		if (!existing) throw notFound();
		// In-use check: any member bound to this role name.
		const [inUse] = await tx<{ n: number }[]>`
			SELECT count(*)::int AS n FROM organization_member
			WHERE organization_id = ${orgId} AND role = ${existing.role}`;
		if (Number(inUse?.n ?? 0) > 0) throw conflict("RoleInUse");
		await tx`DELETE FROM organization_role WHERE id = ${roleId} AND organization_id = ${orgId}`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:role-deleted", payload: { id: roleId } },
		]);
		return { data: { id: roleId }, txid };
	});
}

export interface TeamInput {
	name?: string;
	icon?: string | null;
	parentTeamId?: string | null;
}

async function assertTeamParentOk(
	tx: Sql,
	orgId: string,
	teamId: string | null,
	parentTeamId: string | null,
): Promise<void> {
	interface AncestorRow {
		parent_team_id: string | null;
		organization_id: string;
	}
	if (parentTeamId === null || parentTeamId === undefined) return;
	if (parentTeamId === teamId) throw conflict("TeamCycle");
	const [parent] =
		await tx`SELECT id FROM team WHERE id = ${parentTeamId} AND organization_id = ${orgId}`;
	if (!parent) throw notFound();
	// Walk ancestors; a cycle or cross-org escape is rejected (§2).
	let cursor: string | null = parentTeamId;
	const seen = new Set<string>(teamId ? [teamId] : []);
	for (let depth = 0; depth < 128 && cursor; depth++) {
		if (seen.has(cursor)) throw conflict("TeamCycle");
		seen.add(cursor);
		const rows: AncestorRow[] = await tx`
			SELECT parent_team_id, organization_id FROM team WHERE id = ${cursor}`;
		const parentRow = rows[0];
		if (!parentRow) throw notFound();
		if (parentRow.organization_id !== orgId) throw notFound();
		cursor = parentRow.parent_team_id;
	}
}

export async function createTeam(
	sql: Sql,
	orgId: string,
	input: TeamInput & { name: string },
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		await assertTeamParentOk(tx, orgId, null, input.parentTeamId ?? null);
		const teamId = newId("team");
		const now = new Date();
		await tx`INSERT INTO team (id, name, organization_id, source, icon, parent_team_id, created_at, updated_at)
			VALUES (${teamId}, ${input.name}, ${orgId}, 'stellarc', ${input.icon ?? null}, ${input.parentTeamId ?? null}, ${now}, ${now})`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:team-upserted", payload: { id: teamId } },
		]);
		return {
			data: {
				id: teamId,
				name: input.name,
				organizationId: orgId,
				source: "stellarc",
				icon: input.icon ?? null,
				parentTeamId: input.parentTeamId ?? null,
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
			},
			txid,
		};
	});
}

export async function updateTeam(
	sql: Sql,
	orgId: string,
	teamId: string,
	input: TeamInput,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [team] =
			await tx`SELECT id, name, source, icon, parent_team_id, created_at, updated_at
			FROM team WHERE id = ${teamId} AND organization_id = ${orgId}`;
		if (!team) throw notFound();
		await assertTeamParentOk(
			tx,
			orgId,
			teamId,
			input.parentTeamId !== undefined
				? input.parentTeamId
				: (team.parent_team_id as string | null),
		);
		const name = input.name ?? team.name;
		const icon = input.icon !== undefined ? input.icon : team.icon;
		const parent =
			input.parentTeamId !== undefined
				? input.parentTeamId
				: team.parent_team_id;
		const now = new Date();
		await tx`UPDATE team SET name = ${name}, icon = ${icon}, parent_team_id = ${parent}, updated_at = ${now}
			WHERE id = ${teamId} AND organization_id = ${orgId}`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:team-upserted", payload: { id: teamId } },
		]);
		return {
			data: {
				id: teamId,
				name,
				organizationId: orgId,
				source: team.source,
				icon,
				parentTeamId: parent,
				createdAt: toIsoRow(team.created_at),
				updatedAt: now.toISOString(),
			},
			txid,
		};
	});
}

export async function deleteTeam(
	sql: Sql,
	orgId: string,
	teamId: string,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [team] =
			await tx`SELECT id FROM team WHERE id = ${teamId} AND organization_id = ${orgId}`;
		if (!team) throw notFound();
		// §3: reparented child upserts + removed member deletions in same tx.
		const children = await tx<{ id: string }[]>`
			SELECT id FROM team WHERE parent_team_id = ${teamId} AND organization_id = ${orgId}`;
		const members = await tx<{ id: string }[]>`
			SELECT id FROM team_member WHERE team_id = ${teamId}`;
		const events: EventInsert[] = [];
		await tx`UPDATE team SET parent_team_id = NULL WHERE parent_team_id = ${teamId} AND organization_id = ${orgId}`;
		for (const child of children)
			events.push({
				type: "identity:team-upserted",
				payload: { id: child.id },
			});
		await tx`DELETE FROM team_member WHERE team_id = ${teamId}`;
		for (const member of members)
			events.push({
				type: "identity:team-member-deleted",
				payload: { id: member.id },
			});
		await tx`DELETE FROM team WHERE id = ${teamId} AND organization_id = ${orgId}`;
		events.push({ type: "identity:team-deleted", payload: { id: teamId } });
		const txid = await appendEvents(tx, orgId, actor, events);
		return { data: { id: teamId }, txid };
	});
}

export async function addTeamMember(
	sql: Sql,
	orgId: string,
	teamId: string,
	userId: string,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [team] =
			await tx`SELECT id, organization_id FROM team WHERE id = ${teamId} AND organization_id = ${orgId}`;
		if (!team) throw notFound();
		const [member] =
			await tx`SELECT 1 FROM organization_member WHERE organization_id = ${orgId} AND user_id = ${userId}`;
		if (!member) throw notFound();
		const [dupe] =
			await tx`SELECT id FROM team_member WHERE team_id = ${teamId} AND user_id = ${userId}`;
		if (dupe) throw conflict("Duplicate");
		const id = newId("tm");
		const now = new Date();
		await tx`INSERT INTO team_member (id, team_id, user_id, created_at) VALUES (${id}, ${teamId}, ${userId}, ${now})`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:team-member-upserted", payload: { id } },
		]);
		return {
			data: {
				id,
				teamId,
				userId,
				createdAt: now.toISOString(),
				organizationId: orgId,
			},
			txid,
		};
	});
}

export async function removeTeamMember(
	sql: Sql,
	orgId: string,
	_teamId: string,
	memberId: string,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [row] = await tx`SELECT tm.id FROM team_member tm
			JOIN team t ON t.id = tm.team_id
			WHERE tm.id = ${memberId} AND t.organization_id = ${orgId}`;
		if (!row) throw notFound();
		await tx`DELETE FROM team_member WHERE id = ${memberId}`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:team-member-deleted", payload: { id: memberId } },
		]);
		return { data: { id: memberId }, txid };
	});
}

export interface InvitationContext {
	principalId: string;
	kind: "human" | "agent";
	userId: string;
}

export async function createInvitation(
	sql: Sql,
	orgId: string,
	input: { email: string; role: string; teamId: string | null },
	ctx: InvitationContext,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		if (input.teamId) {
			const [team] =
				await tx`SELECT id FROM team WHERE id = ${input.teamId} AND organization_id = ${orgId}`;
			if (!team) throw notFound();
		}
		const id = newId("inv");
		const now = new Date();
		const expires = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
		await tx`INSERT INTO invitation (id, organization_id, email, role, team_id, status, expires_at, created_at, inviter_id)
			VALUES (${id}, ${orgId}, ${input.email}, ${input.role}, ${input.teamId}, 'pending', ${expires}, ${now}, ${ctx.userId})`;
		const txid = await appendEvents(tx, orgId, ctx.principalId, [
			{ type: "identity:invitation-upserted", payload: { id } },
		]);
		return {
			data: {
				id,
				organizationId: orgId,
				email: input.email,
				role: input.role,
				teamId: input.teamId,
				status: "pending",
				expiresAt: expires.toISOString(),
				createdAt: now.toISOString(),
				inviterId: ctx.userId,
			},
			txid,
		};
	});
}

export async function cancelInvitation(
	sql: Sql,
	orgId: string,
	invitationId: string,
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [row] =
			await tx`SELECT id, status FROM invitation WHERE id = ${invitationId} AND organization_id = ${orgId}`;
		if (!row) throw notFound();
		// §2: invitations change status through upsert, never physical delete.
		await tx`UPDATE invitation SET status = 'canceled' WHERE id = ${invitationId}`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:invitation-upserted", payload: { id: invitationId } },
		]);
		return { data: { id: invitationId, status: "canceled" }, txid };
	});
}

export async function acceptInvitation(
	sql: Sql,
	invitationId: string,
	ctx: InvitationContext,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		// Conditional status update consumes the invitation exactly once
		// under concurrency (T18 negative control).
		const consumed = await tx`UPDATE invitation SET status = 'accepted'
			WHERE id = ${invitationId} AND status = 'pending' AND expires_at > now()
			RETURNING id, organization_id, email, role, team_id, expires_at, created_at, inviter_id`;
		const invitation = consumed[0];
		if (!invitation) {
			const [anyRow] =
				await tx`SELECT organization_id FROM invitation WHERE id = ${invitationId}`;
			if (!anyRow) throw notFound();
			throw conflict("AlreadyAccepted");
		}
		const orgId = String(invitation.organization_id);
		await lockOrg(tx, orgId);
		// Invitee identity must match the authenticated user's email (§3
		// authenticated matching invitee).
		const [invitee] =
			await tx`SELECT email FROM "user" WHERE id = ${ctx.userId}`;
		if (!invitee || invitee.email !== invitation.email) {
			throw forbidden();
		}
		const memberId = newId("member");
		const now = new Date();
		await tx`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
			VALUES (${memberId}, ${orgId}, ${ctx.userId}, ${invitation.role ?? "member"}, ${now})`;
		if (invitation.team_id) {
			await tx`INSERT INTO team_member (id, team_id, user_id, created_at)
				VALUES (${newId("tm")}, ${invitation.team_id}, ${ctx.userId}, ${now})
				ON CONFLICT DO NOTHING`;
		}
		const principalId = humanPrincipalId(ctx.userId);
		await tx`INSERT INTO principal (id, kind, user_id, apikey_id)
			VALUES (${principalId}, 'human', ${ctx.userId}, null)
			ON CONFLICT (id) DO NOTHING`;
		await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
			VALUES (${orgId}, ${principalId}, 'org:member')
			ON CONFLICT DO NOTHING`;
		const txid = await appendEvents(tx, orgId, ctx.principalId, [
			{ type: "identity:member-upserted", payload: { id: memberId } },
			{ type: "identity:invitation-upserted", payload: { id: invitationId } },
			{
				type: "identity:grant-upserted",
				payload: { principalId, capability: "org:member" },
			},
		]);
		return {
			data: {
				id: memberId,
				organizationId: orgId,
				userId: ctx.userId,
				role: invitation.role ?? "member",
				joinedAt: now.toISOString(),
				principalId,
			},
			txid,
		};
	});
}

export async function updateOrganization(
	sql: Sql,
	orgId: string,
	input: { name?: string; description?: string | null; slug?: string },
	actor: string,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [org] =
			await tx`SELECT id, name, slug, description, created_at FROM organization WHERE id = ${orgId}`;
		if (!org) throw notFound();
		if (input.slug !== undefined && input.slug !== org.slug) {
			const [taken] =
				await tx`SELECT id FROM organization WHERE (slug = ${input.slug} OR lower(slug) = lower(${input.slug})) AND id <> ${orgId}`;
			if (taken) throw conflict("Duplicate");
		}
		const name = input.name ?? org.name;
		const description =
			input.description !== undefined ? input.description : org.description;
		const slug = input.slug ?? org.slug;
		await tx`UPDATE organization SET name = ${name}, description = ${description}, slug = ${slug} WHERE id = ${orgId}`;
		const txid = await appendEvents(tx, orgId, actor, [
			{ type: "identity:organization-upserted", payload: { id: orgId } },
		]);
		return {
			data: {
				id: orgId,
				name,
				slug,
				logo: null,
				metadata: null,
				description,
				reposEnabled: false,
				tablesEnabled: false,
				workEnabled: false,
				defaultResourcePrivilege: "manage",
				aiEnabled: false,
				aiDefaultTokenLimit: 1024,
				aiDefaultCharacterLimit: 4000,
				aiProviderBaseUrl: null,
				aiProviderModel: null,
				createdAt: toIsoRow(org.created_at),
			},
			txid,
		};
	});
}

import { agentPrincipalId, apiKeyDigest } from "./auth";

export async function createApiKey(
	sql: Sql,
	orgId: string,
	input: { name: string; permissions: PermissionMap; expiresAt: string | null },
	ctx: InvitationContext,
): Promise<
	MutationResult & { data: { key: Record<string, unknown>; secret: string } }
> {
	// §3: one-time secret, digest stored, ceiling ≤ issuer capabilities.
	// The route layer already enforced human-session + apikey:create.
	const secret = `stellarc_${randomBytes(24).toString("base64url")}`;
	const digest = apiKeyDigest(secret);
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const keyId = newId("key");
		const prefix = secret.slice(0, 12);
		const now = new Date();
		const expires = input.expiresAt ? new Date(input.expiresAt) : null;
		await tx`INSERT INTO apikey (id, config_id, name, reference_id, prefix, "key", permissions, enabled, expires_at, created_at, updated_at)
			VALUES (${keyId}, ${`cfg-${keyId}`}, ${input.name}, ${ctx.userId}, ${prefix}, ${digest}, ${JSON.stringify(input.permissions)}, true, ${expires}, ${now}, ${now})`;
		// Agent principal + org grants immediately (ceiling = permissions).
		const principalId = agentPrincipalId(keyId);
		await tx`INSERT INTO principal (id, kind, user_id, apikey_id)
			VALUES (${principalId}, 'agent', ${ctx.userId}, ${keyId})
			ON CONFLICT (id) DO NOTHING`;
		const events: EventInsert[] = [
			{ type: "identity:apikey-upserted", payload: { id: keyId } },
			{
				type: "identity:principal-upserted",
				payload: {
					id: principalId,
					row: { id: principalId, kind: "agent", userId: ctx.userId },
				},
			},
		];
		await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
			VALUES (${orgId}, ${principalId}, 'org:member')
			ON CONFLICT DO NOTHING`;
		events.push({
			type: "identity:grant-upserted",
			payload: { principalId, capability: "org:member" },
		});
		for (const [resource, actions] of Object.entries(input.permissions)) {
			for (const action of actions) {
				const cap = `${resource}:${action}`;
				await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
					VALUES (${orgId}, ${principalId}, ${cap})
					ON CONFLICT DO NOTHING`;
				events.push({
					type: "identity:grant-upserted",
					payload: { principalId, capability: cap },
				});
			}
		}
		const txid = await appendEvents(tx, orgId, ctx.principalId, events);
		return {
			data: {
				key: {
					id: keyId,
					configId: `cfg-${keyId}`,
					name: input.name,
					start: null,
					referenceId: ctx.userId,
					prefix,
					refillInterval: null,
					refillAmount: null,
					lastRefillAt: null,
					enabled: true,
					rateLimitEnabled: null,
					rateLimitTimeWindow: null,
					rateLimitMax: null,
					requestCount: null,
					remaining: null,
					lastRequest: null,
					expiresAt: expires ? expires.toISOString() : null,
					createdAt: now.toISOString(),
					updatedAt: now.toISOString(),
					permissions: input.permissions,
					metadata: null,
				},
				secret,
			},
			txid,
		};
	});
}

export async function deleteApiKey(
	sql: Sql,
	orgId: string,
	keyId: string,
	ctx: InvitationContext,
): Promise<MutationResult> {
	return sql.begin(async (tx) => {
		await lockOrg(tx, orgId);
		const [key] =
			await tx`SELECT id, reference_id FROM apikey WHERE id = ${keyId}`;
		if (!key) throw notFound();
		// Own key only (§3): the owner or the agent itself (same owner).
		if (key.reference_id !== ctx.userId) throw forbidden();
		const principalId = agentPrincipalId(keyId);
		const removed =
			await tx`DELETE FROM identity_grant WHERE org_id = ${orgId} AND principal_id = ${principalId} RETURNING capability`;
		await tx`DELETE FROM apikey WHERE id = ${keyId}`;
		const events: EventInsert[] = [
			{ type: "identity:apikey-deleted", payload: { id: keyId } },
		];
		for (const row of removed)
			events.push({
				type: "identity:grant-deleted",
				payload: { principalId, capability: row.capability },
			});
		const txid = await appendEvents(tx, orgId, ctx.principalId, events);
		return { data: { id: keyId }, txid };
	});
}
