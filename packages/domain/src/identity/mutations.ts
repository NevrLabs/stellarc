import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { humanPrincipalId } from "./auth";

// STL-15 §2 mutations: every domain write, projection row and event commits
// atomically on one connection. Org-scoped mutations take a transaction
// advisory lock on the org (T14) so concurrent last-owner removals serialize.
// Events carry sanitized public rows only — no secrets, no hashes, no bytes.

export interface Failure {
	readonly _tag: "Conflict" | "NotFound";
	readonly code?: string;
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

async function appendEvents(
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
					{
						type: "identity:grant-upserted",
						payload: { principalId, capability: "org:member" },
					},
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
		// establishes actor context before any mutation runs.
		throw conflict("Unauthenticated");
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
			await tx`SELECT id, role FROM organization_member WHERE id = ${memberId} AND organization_id = ${org.id}`;
		if (!member) throw notFound();
		if (member.role === "owner") {
			const owners = await tx<{ n: number }[]>`
				SELECT count(*)::int AS n FROM organization_member
				WHERE organization_id = ${org.id} AND role = 'owner'`;
			if (Number(owners[0]?.n ?? 0) <= 1) throw conflict("LastOwner");
		}
		await tx`DELETE FROM organization_member WHERE id = ${memberId} AND organization_id = ${org.id}`;
		// Events live in the org's canonical-ID namespace, exactly like every
		// other identity event — never under the caller's raw path argument.
		const txid = await appendEvents(tx, org.id, actorPrincipalId, [
			{ type: "identity:member-deleted", payload: { id: memberId } },
		]);
		return { data: { id: memberId }, txid };
	});
}

export function newId(prefix: string): string {
	return randomId(prefix);
}
