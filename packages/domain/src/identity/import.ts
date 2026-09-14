import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { appendEvents } from "./mutations";

// STL-15 §2 importer: one destination transaction per full fixture run, one
// ledger row per imported PK, zero new events on identical rerun, abort
// before any destination writes on source mismatch. Secrets, hashes, bytes
// and emails never appear in the returned report (§2 "No tokens, emails,
// hashes or bytes in logs/report output").

/** Deterministic maintenance source ID for fixtures/tests (not an HTTP bypass). */
export function fixtureSourceId(name: string): string {
	return `fixture:${name}`;
}

/** Canonical all-column representation: null stays the string "null", bytea
 * enters the hash as raw bytes, timestamps as their driver text form. */
function canonicalDigest(parts: unknown[]): string {
	const hash = createHash("sha256");
	for (const part of parts) {
		if (part === null || part === undefined) {
			hash.update("null");
		} else if (Buffer.isBuffer(part)) {
			hash.update(part);
		} else {
			hash.update(String(part));
		}
		hash.update("\x1f");
	}
	return hash.digest("hex");
}

/** snake_case column layout per §2, in FK-safe dependency order. Teams import
 * in two passes (parents then children) so parent_team_id resolves. */
const TABLES: Array<{
	name: string;
	pk: string;
	columns: string[];
	/** Import pass 1 or 2 (team children wait for parents). */
	pass?: 2;
	/** Ledger namespace — two passes over one table use distinct ledgers. */
	ledger?: string;
	/** Columns read as PG hex text that must re-enter as real bytes. */
	bytea?: string[];
}> = [
	{
		name: "user",
		pk: "id",
		columns: [
			"id",
			"name",
			"email",
			"email_verified",
			"image",
			"locale",
			"created_at",
			"updated_at",
			"is_anonymous",
			"role",
			"banned",
			"ban_reason",
			"ban_expires",
		],
	},
	{
		name: "account",
		pk: "id",
		columns: [
			"id",
			"account_id",
			"provider_id",
			"user_id",
			"access_token",
			"refresh_token",
			"id_token",
			"access_token_expires_at",
			"refresh_token_expires_at",
			"scope",
			"password",
			"created_at",
			"updated_at",
		],
	},
	{
		name: "organization",
		pk: "id",
		columns: [
			"id",
			"name",
			"slug",
			"logo",
			"metadata",
			"description",
			"repos_enabled",
			"tables_enabled",
			"work_enabled",
			"default_resource_privilege",
			"ai_enabled",
			"ai_default_token_limit",
			"ai_default_character_limit",
			"ai_provider_base_url",
			"ai_provider_model",
			"ai_provider_api_key",
			"created_at",
		],
	},
	{
		name: "organization_role",
		pk: "id",
		columns: [
			"id",
			"organization_id",
			"role",
			"permission",
			"created_at",
			"updated_at",
		],
	},
	{
		name: "organization_member",
		pk: "id",
		columns: [
			"id",
			"organization_id",
			"user_id",
			"role",
			"ai_token_limit",
			"ai_character_limit",
			"joined_at",
		],
	},
	{
		name: "team",
		pk: "id",
		columns: [
			"id",
			"name",
			"organization_id",
			"source",
			"icon",
			"created_at",
			"updated_at",
		],
		ledger: "team",
	},
	{
		name: "team",
		pk: "id",
		columns: [
			"id",
			"name",
			"organization_id",
			"source",
			"icon",
			"parent_team_id",
			"created_at",
			"updated_at",
		],
		pass: 2,
		ledger: "team#parent",
	},
	{
		name: "team_member",
		pk: "id",
		columns: ["id", "team_id", "user_id", "created_at"],
	},
	{
		name: "invitation",
		pk: "id",
		columns: [
			"id",
			"organization_id",
			"email",
			"role",
			"team_id",
			"status",
			"expires_at",
			"created_at",
			"inviter_id",
		],
	},
	{
		name: "apikey",
		pk: "id",
		columns: [
			"id",
			"config_id",
			"name",
			"start",
			"reference_id",
			"prefix",
			"key",
			"user_id",
			"refill_interval",
			"refill_amount",
			"last_refill_at",
			"enabled",
			"rate_limit_enabled",
			"rate_limit_time_window",
			"rate_limit_max",
			"request_count",
			"remaining",
			"last_request",
			"expires_at",
			"created_at",
			"updated_at",
			"permissions",
			"metadata",
		],
	},
	{
		name: "user_avatar",
		pk: "id",
		columns: [
			"id",
			"user_id",
			"mime_type",
			"size",
			"data",
			"created_at",
			"updated_at",
		],
		bytea: ["data"],
	},
];

/** Per-table §2 event type for projection seeding (sanitized public rows). */
const TABLE_EVENT: Record<string, string> = {
	user: "identity:user-upserted",
	organization: "identity:organization-upserted",
	organization_member: "identity:member-upserted",
	organization_role: "identity:role-upserted",
	team: "identity:team-upserted",
	team_member: "identity:team-member-upserted",
	invitation: "identity:invitation-upserted",
	apikey: "identity:apikey-upserted",
	user_avatar: "identity:avatar-upserted",
};

/** Preflight validation (§2): reject duplicates, broken FKs and malformed
 * values BEFORE any destination write, with a sanitized report — only table
 * and column names, never row values (no emails/hashes/bytes). */
function preflight(
	staged: Array<{
		table: string;
		pk: string;
		columns: string[];
		rows: unknown[][];
		digests: string[];
	}>,
): void {
	const problems: string[] = [];
	const idx = (entry: { columns: string[] }, col: string) =>
		entry.columns.indexOf(col);

	// Duplicate natural-key pairs (§2: never silently discard duplicates).
	const duplicateChecks: Record<string, Array<[string, string]>> = {
		organization_member: [["organization_id", "user_id"]],
		organization_role: [["organization_id", "role"]],
		team_member: [["team_id", "user_id"]],
	};
	for (const entry of staged) {
		const checks = duplicateChecks[entry.table];
		if (!checks) continue;
		for (const [colA, colB] of checks) {
			const seen = new Set<string>();
			const ia = idx(entry, colA);
			const ib = idx(entry, colB);
			for (const row of entry.rows) {
				const key = `${String(row[ia])}\u001f${String(row[ib])}`;
				if (seen.has(key)) {
					problems.push(
						`${entry.table}: duplicate (${colA},${colB}) source pair; resolve duplicates before import`,
					);
					break;
				}
				seen.add(key);
			}
		}
	}

	// Row-level format checks (sanitized: name the column, never the value).
	for (const entry of staged) {
		const { table } = entry;
		for (const row of entry.rows) {
			if (table === "organization_role") {
				const raw = row[idx(entry, "permission")];
				if (typeof raw === "string" && raw.length > 0) {
					let ok = false;
					try {
						const parsed: unknown = JSON.parse(raw);
						ok = parsed !== null && typeof parsed === "object";
					} catch {
						ok = false;
					}
					if (!ok)
						problems.push(
							"organization_role: malformed permission JSON in column permission",
						);
				}
			}
			if (table === "account") {
				const hash = row[idx(entry, "password")];
				if (
					typeof hash === "string" &&
					hash.length > 0 &&
					!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)
				)
					problems.push(
						"account: password column is not a bcrypt hash (refusing plaintext import)",
					);
			}
			if (table === "apikey") {
				const digest = row[idx(entry, "key")];
				if (
					typeof digest === "string" &&
					digest.length > 0 &&
					!/^[A-Za-z0-9_-]{43}$/.test(digest)
				)
					problems.push("apikey: key column is not a base64url SHA-256 digest");
				const permissions = row[idx(entry, "permissions")];
				if (typeof permissions === "string" && permissions.length > 0) {
					let ok = false;
					try {
						const parsed: unknown = JSON.parse(permissions);
						ok = parsed !== null && typeof parsed === "object";
					} catch {
						ok = false;
					}
					if (!ok)
						problems.push(
							"apikey: malformed permissions JSON in column permissions",
						);
				}
			}
			if (table === "user_avatar") {
				const mime = row[idx(entry, "mime_type")];
				if (
					typeof mime === "string" &&
					!/^image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif)$/i.test(mime)
				)
					problems.push(
						"user_avatar: unsafe mime_type (expected an image/* type)",
					);
				const size = row[idx(entry, "size")];
				const data = row[idx(entry, "data")];
				if (typeof size === "string" && data !== null) {
					const declared = Number(size);
					const actual = String(data).length;
					if (Number.isFinite(declared) && actual < declared)
						problems.push(
							"user_avatar: data length does not match declared size",
						);
				}
			}
		}
	}

	// Cross-table FK checks against the staged snapshot only.
	const tableRows = new Map<string, unknown[][]>();
	const tableColumns = new Map<string, string[]>();
	for (const entry of staged) {
		if (entry.table === "team" && entry.columns.includes("parent_team_id"))
			continue; // pass-2 entry owns the FK-checked team columns
		if (!tableRows.has(entry.table)) {
			tableRows.set(entry.table, entry.rows);
			tableColumns.set(entry.table, entry.columns);
		}
	}
	const pkSets = new Map<string, Set<string>>();
	for (const [table, rows] of tableRows) {
		const columns = tableColumns.get(table) ?? [];
		const pkIdx = columns.indexOf("id");
		if (pkIdx === -1) continue;
		const set = new Set<string>();
		for (const row of rows) set.add(String(row[pkIdx]));
		pkSets.set(table, set);
	}
	const col = (table: string, name: string, row: unknown[]) => {
		const columns = tableColumns.get(table) ?? [];
		return row[columns.indexOf(name)];
	};
	const fkChecks: Record<string, Array<[string, string, string]>> = {
		account: [["user_id", "user", "id"]],
		organization_member: [
			["organization_id", "organization", "id"],
			["user_id", "user", "id"],
		],
		organization_role: [["organization_id", "organization", "id"]],
		team: [
			["organization_id", "organization", "id"],
			["parent_team_id", "team", "id"],
		],
		team_member: [
			["team_id", "team", "id"],
			["user_id", "user", "id"],
		],
		invitation: [
			["organization_id", "organization", "id"],
			["team_id", "team", "id"],
			["inviter_id", "user", "id"],
		],
		apikey: [
			["reference_id", "user", "id"],
			["user_id", "user", "id"],
		],
		user_avatar: [["user_id", "user", "id"]],
	};
	for (const [table, checks] of Object.entries(fkChecks)) {
		const rows = tableRows.get(table);
		if (!rows) continue;
		for (const [fkCol, refTable] of checks) {
			const refSet = pkSets.get(refTable);
			if (!refSet) continue;
			for (const row of rows) {
				const value = col(table, fkCol, row);
				if (value === null || value === undefined || value === "") continue;
				if (!refSet.has(String(value))) {
					problems.push(`${table}: ${fkCol} references missing ${refTable}.id`);
					break;
				}
			}
		}
	}

	if (problems.length > 0) {
		const unique = [...new Set(problems)];
		throw new Error(
			`Identity import preflight failed (${unique.length} problem(s)):\n${unique.join(";\n")}`,
		);
	}
}

/** Column names are compile-time constants from TABLES — never caller input —
 * so identifier interpolation here is injection-safe (§3 T08 discipline). */
export interface ImportReport {
	readonly status: "imported" | "unchanged";
	readonly sourceId: string;
	readonly tableCounts: Record<string, number>;
	/** Sanitized projection-seeding events emitted this run. */
	readonly eventCount: number;
	readonly changed: number;
	readonly identical: number;
}

function quoteIdent(name: string): string {
	if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Bad column name");
	return `"${name}"`;
}

export async function importIdentity(
	source: Sql,
	destination: Sql,
	sourceId: string,
): Promise<ImportReport> {
	const tableCounts: Record<string, number> = {};
	let changed = 0;
	let identical = 0;
	let eventCount = 0;
	// Ledger keys of rows actually written this run (drives event emission).
	const changedKeys = new Set<string>();
	// Stage 1: read + preflight the whole snapshot (source stays read-only).
	const staged: Array<{
		table: string;
		pk: string;
		columns: string[];
		rows: unknown[][];
		digests: string[];
		pass?: 2;
		ledger?: string;
		bytea?: string[];
	}> = [];
	for (const entry of TABLES) {
		const textCols = entry.columns
			.map((c) => `${quoteIdent(c)}::text`)
			.join(",");
		const order = entry.pass === 2 ? "id" : entry.pk;
		const objectRows = (await source.unsafe(
			`SELECT ${textCols} FROM ${quoteIdent(entry.name)} ORDER BY ${order}`,
		)) as Array<Record<string, string | null>>;
		const rows: unknown[][] = objectRows.map(
			(obj: Record<string, string | null>) =>
				entry.columns.map((c) => obj[c] ?? null),
		);
		tableCounts[entry.name] = (tableCounts[entry.name] ?? 0) + rows.length;
		const digests: string[] = [];
		const values: unknown[][] = [];
		for (const row of rows) {
			values.push(row);
			digests.push(canonicalDigest(row));
		}
		staged.push({
			table: entry.name,
			pk: entry.pk,
			columns: entry.columns,
			rows: values,
			digests,
			pass: entry.pass,
			ledger: entry.ledger,
			bytea: entry.bytea,
		});
	}

	// Preflight the whole snapshot before any destination write (§2, T25).

	preflight(staged);

	// Stage 2: apply + ledger + seed events in ONE destination transaction.
	await destination.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(7414030915)`;
		for (const entry of staged) {
			const table = entry.table;
			const cols = entry.columns;
			for (let i = 0; i < entry.rows.length; i++) {
				const row = entry.rows[i];
				const digest = entry.digests[i];
				const pkValue = row[cols.indexOf(entry.pk)];
				const ledgerName = entry.ledger ?? table;
				const [existing] = await tx<{ digest: string }[]>`
					SELECT digest FROM identity_import
					WHERE source_id = ${sourceId} AND table_name = ${ledgerName}
						AND source_pk = ${String(pkValue)}`;
				if (existing) {
					if (existing.digest === digest) {
						identical++;
						continue;
					}
					throw new Error(
						`Identity import conflict: row changed; explicit replace mode required (${table}/${String(pkValue)})`,
					);
				}
				// Bytea columns arrive as PG hex text ("\\x...") from the
				// text-cast snapshot; decode to raw bytes before rebinding.
				const params = entry.bytea
					? row.map((value, idx) => {
							const name = cols[idx];
							if (
								entry.bytea?.includes(name ?? "") &&
								typeof value === "string" &&
								value.startsWith("\\x")
							)
								return Buffer.from(value.slice(2), "hex");
							return value;
						})
					: row;
				const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(",");
				const colList = cols.map(quoteIdent).join(",");
				// Pass 2 backfills parent_team_id on rows pass 1 already inserted.
				const onConflict =
					entry.pass === 2
						? " ON CONFLICT (id) DO UPDATE SET parent_team_id = EXCLUDED.parent_team_id"
						: " ON CONFLICT DO NOTHING";
				await tx.unsafe(
					`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})${onConflict}`,
					params as never[],
				);
				await tx`INSERT INTO identity_import (source_id, table_name, source_pk, digest)
					VALUES (${sourceId}, ${ledgerName}, ${String(pkValue)}, ${digest})`;
				changed++;
				changedKeys.add(`${ledgerName}\u001f${String(pkValue)}`);
			}
		}

		// Structural projection: one agent principal per imported key with a
		// resolvable owner; org:member grants follow the owner's memberships.
		const keys = await tx<
			{ id: string; reference_id: string; permissions: string | null }[]
		>`
			SELECT id, reference_id, permissions FROM apikey`;
		for (const key of keys) {
			const principalId = `agent:${key.id}`;
			const [owner] =
				await tx`SELECT 1 FROM "user" WHERE id = ${key.reference_id}`;
			if (!owner) continue;
			await tx`INSERT INTO principal (id, kind, user_id, apikey_id)
				VALUES (${principalId}, 'agent', ${key.reference_id}, ${key.id})
				ON CONFLICT (id) DO NOTHING`;
			const scopes = await tx<{ organization_id: string }[]>`
				SELECT organization_id FROM organization_member WHERE user_id = ${key.reference_id}`;
			for (const scope of scopes) {
				await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
					VALUES (${scope.organization_id}, ${principalId}, 'org:member')
					ON CONFLICT DO NOTHING`;
			}
		}

		// Sanitized projection-seeding events per changed row (§2, D12): one
		// identity:<table>-upserted event per changed row keyed to its org,
		// derived structural principal/grant events, and an exact eventCount.
		if (changed > 0) {
			// Map org ID -> events. user rows fan out per membership org; org-
			// scoped rows key on their own org; avatar events carry ids only.
			const eventsByOrg = new Map<
				string,
				Array<{ type: string; payload: Record<string, unknown> }>
			>();
			const push = (
				org: string,
				ev: { type: string; payload: Record<string, unknown> },
			) => {
				const list = eventsByOrg.get(org) ?? [];
				list.push(ev);
				eventsByOrg.set(org, list);
			};
			// Public-row projectors: allowlisted columns only, secrets omitted.
			const rowToPublic = (
				table: string,
				row: unknown[],
				columns: string[],
			) => {
				const obj: Record<string, unknown> = {};
				const at = (name: string) => row[columns.indexOf(name)];
				switch (table) {
					case "user":
						obj.id = at("id");
						obj.name = at("name");
						obj.email = at("email");
						obj.emailVerified =
							at("email_verified") === "true" || at("email_verified") === true;
						obj.image = at("image");
						obj.locale = at("locale");
						obj.createdAt = at("created_at");
						obj.updatedAt = at("updated_at");
						obj.isAnonymous = at("is_anonymous");
						break;
					case "organization": {
						obj.id = at("id");
						obj.name = at("name");
						obj.slug = at("slug");
						obj.logo = at("logo");
						obj.metadata = at("metadata");
						obj.description = at("description");
						obj.reposEnabled =
							at("repos_enabled") === "true" || at("repos_enabled") === true;
						obj.tablesEnabled =
							at("tables_enabled") === "true" || at("tables_enabled") === true;
						obj.workEnabled =
							at("work_enabled") === "true" || at("work_enabled") === true;
						obj.defaultResourcePrivilege = at("default_resource_privilege");
						obj.aiEnabled =
							at("ai_enabled") === "true" || at("ai_enabled") === true;
						obj.aiDefaultTokenLimit = Number(at("ai_default_token_limit"));
						obj.aiDefaultCharacterLimit = Number(
							at("ai_default_character_limit"),
						);
						obj.aiProviderBaseUrl = at("ai_provider_base_url");
						obj.aiProviderModel = at("ai_provider_model");
						obj.createdAt = at("created_at");
						break;
					}
					case "organization_member":
						obj.id = at("id");
						obj.organizationId = at("organization_id");
						obj.userId = at("user_id");
						obj.role = at("role");
						obj.aiTokenLimit =
							at("ai_token_limit") === null
								? null
								: Number(at("ai_token_limit"));
						obj.aiCharacterLimit =
							at("ai_character_limit") === null
								? null
								: Number(at("ai_character_limit"));
						obj.joinedAt = at("joined_at");
						break;
					case "organization_role":
						obj.id = at("id");
						obj.organizationId = at("organization_id");
						obj.role = at("role");
						try {
							obj.permission = JSON.parse(String(at("permission") ?? "{}"));
						} catch {
							obj.permission = {};
						}
						obj.createdAt = at("created_at");
						obj.updatedAt = at("updated_at");
						break;
					case "team":
						obj.id = at("id");
						obj.name = at("name");
						obj.organizationId = at("organization_id");
						obj.source = at("source");
						obj.icon = at("icon");
						obj.parentTeamId = at("parent_team_id");
						obj.createdAt = at("created_at");
						obj.updatedAt = at("updated_at");
						break;
					case "team_member":
						obj.id = at("id");
						obj.teamId = at("team_id");
						obj.userId = at("user_id");
						obj.createdAt = at("created_at");
						break;
					case "invitation":
						obj.id = at("id");
						obj.organizationId = at("organization_id");
						obj.email = at("email");
						obj.role = at("role");
						obj.teamId = at("team_id");
						obj.status = at("status");
						obj.expiresAt = at("expires_at");
						obj.createdAt = at("created_at");
						obj.inviterId = at("inviter_id");
						break;
					case "apikey":
						obj.id = at("id");
						obj.configId = at("config_id");
						obj.name = at("name");
						obj.start = at("start");
						obj.referenceId = at("reference_id");
						obj.prefix = at("prefix");
						obj.enabled = at("enabled");
						obj.expiresAt = at("expires_at");
						try {
							obj.permissions =
								at("permissions") === null
									? null
									: JSON.parse(String(at("permissions")));
						} catch {
							obj.permissions = null;
						}
						obj.createdAt = at("created_at");
						obj.updatedAt = at("updated_at");
						break;
					case "user_avatar":
						obj.id = at("id");
						obj.userId = at("user_id");
						obj.mimeType = at("mime_type");
						obj.size = Number(at("size"));
						obj.createdAt = at("created_at");
						obj.updatedAt = at("updated_at");
						break;
				}
				return obj;
			};
			// Membership index: userId -> orgs (drives fanout scoping).
			const userOrgs = new Map<string, string[]>();
			{
				const members = staged.filter((e) => e.table === "organization_member");
				for (const m of members[0]?.rows ?? []) {
					const cols = members[0]?.columns ?? [];
					const userId = String(m[cols.indexOf("user_id")]);
					const orgId = String(m[cols.indexOf("organization_id")]);
					const list = userOrgs.get(userId) ?? [];
					list.push(orgId);
					userOrgs.set(userId, list);
				}
			}
			for (const entry of staged) {
				const eventType = TABLE_EVENT[entry.table];
				if (!eventType) continue;
				// Pass-1 team rows re-appear in pass 2 (parent backfill): emit once.
				if (entry.table === "team" && entry.pass !== 2) continue;
				for (const row of entry.rows) {
					const pkValue = String(row[entry.columns.indexOf(entry.pk)]);
					const isChanged = changedKeys.has(
						`${entry.ledger ?? entry.table}\u001f${pkValue}`,
					);
					if (!isChanged) continue;
					const payloadRow = rowToPublic(entry.table, row, entry.columns);
					if (entry.table === "user") {
						// §2: user-upserted fans out into each membership org only.
						for (const org of userOrgs.get(pkValue) ?? []) {
							push(org, {
								type: eventType,
								payload: { id: pkValue, row: payloadRow },
							});
						}
					} else if (entry.table === "user_avatar") {
						// §2: avatar events carry ids/timestamps only, never bytes.
						const orgs =
							userOrgs.get(String(row[entry.columns.indexOf("user_id")])) ?? [];
						for (const org of orgs) {
							push(org, {
								type: eventType,
								payload: {
									userId: payloadRow.userId,
									avatarId: payloadRow.id,
									updatedAt: payloadRow.updatedAt,
								},
							});
						}
					} else if (entry.table === "apikey") {
						// Keys belong to their owner's orgs; payload omits the digest.
						const orgs =
							userOrgs.get(
								String(row[entry.columns.indexOf("reference_id")]),
							) ?? [];
						for (const org of orgs) {
							push(org, {
								type: eventType,
								payload: { id: pkValue, row: payloadRow },
							});
						}
					} else if (entry.columns.includes("organization_id")) {
						push(String(row[entry.columns.indexOf("organization_id")]), {
							type: eventType,
							payload: { id: pkValue, row: payloadRow },
						});
					} else {
						// user/team-less rows: key to the single org if exactly one exists
						const orgs = [...userOrgs.values()][0] ?? [];
						if (orgs.length > 0)
							push(orgs[0], {
								type: eventType,
								payload: { id: pkValue, row: payloadRow },
							});
					}
				}
			}
			// Structural projection: human principal + grant per member (§2
			// "then principals/grants"), agent principal + grants per key.
			const memberRows = await tx<
				{ user_id: string; organization_id: string }[]
			>`SELECT user_id, organization_id FROM organization_member`;
			for (const m of memberRows) {
				const principalId = `human:${m.user_id}`;
				await tx`INSERT INTO principal (id, kind, user_id, apikey_id)
						VALUES (${principalId}, 'human', ${m.user_id}, null)
						ON CONFLICT (id) DO NOTHING`;
				await tx`INSERT INTO identity_grant (org_id, principal_id, capability)
						VALUES (${m.organization_id}, ${principalId}, 'org:member')
						ON CONFLICT DO NOTHING`;
			}
			const keys = await tx<
				{ id: string; reference_id: string; permissions: string | null }[]
			>`SELECT id, reference_id, permissions FROM apikey`;
			for (const key of keys) {
				const principalId = `agent:${key.id}`;
				const [owner] =
					await tx`SELECT 1 FROM "user" WHERE id = ${key.reference_id}`;
				if (!owner) continue;
				for (const org of userOrgs.get(key.reference_id) ?? []) {
					push(org, {
						type: "identity:principal-upserted",
						payload: {
							id: principalId,
							row: { id: principalId, kind: "agent", userId: key.reference_id },
						},
					});
					push(org, {
						type: "identity:grant-upserted",
						payload: { principalId, capability: "org:member" },
					});
				}
			}
			// Human principals for every member (importer-scope projection).
			const humans = await tx<
				{ id: string; user_id: string; organization_id: string }[]
			>`
					SELECT principal.id, principal.user_id, organization_member.organization_id
					FROM principal
					JOIN organization_member ON organization_member.user_id = principal.user_id
					WHERE principal.kind = 'human'`;
			for (const h of humans) {
				push(h.organization_id, {
					type: "identity:principal-upserted",
					payload: {
						id: h.id,
						row: { id: h.id, kind: "human", userId: h.user_id },
					},
				});
				push(h.organization_id, {
					type: "identity:grant-upserted",
					payload: { principalId: h.id, capability: "org:member" },
				});
			}
			for (const [org, list] of eventsByOrg) {
				await appendEvents(tx, org, "identity-importer", list);
				eventCount += list.length;
			}
		}
	});

	return {
		status: changed > 0 ? "imported" : "unchanged",
		sourceId,
		tableCounts,
		eventCount,
		changed,
		identical,
	};
}
