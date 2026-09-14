import { createHash } from "node:crypto";
import type { Sql } from "postgres";

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
	const separators: string[] = [];
	for (const part of parts) {
		if (part === null || part === undefined) {
			separators.push("null");
			hash.update("null");
		} else if (Buffer.isBuffer(part)) {
			hash.update(part);
		} else {
			hash.update(String(part));
		}
		hash.update("\x1f");
	}
	void separators;
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

export interface ImportReport {
	readonly status: "imported" | "unchanged";
	readonly sourceId: string;
	readonly tableCounts: Record<string, number>;
	/** Sanitized projection-seeding events emitted this run. */
	readonly eventCount: number;
	readonly changed: number;
	readonly identical: number;
}

/** Column names are compile-time constants from TABLES — never caller input —
 * so identifier interpolation here is injection-safe (§3 T08 discipline). */
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
				eventCount++;
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

		// Sanitized projection-seeding events per affected org (§2). Only run 1
		// emits (changed > 0); reruns with zero changed rows emit nothing.
		if (changed > 0) {
			const orgs = await tx<
				Record<string, string | null>[]
			>`SELECT * FROM organization ORDER BY id`;
			for (const org of orgs) {
				const row = {
					id: org.id,
					name: org.name,
					slug: org.slug,
					logo: org.logo,
					metadata: org.metadata,
					description: org.description,
					reposEnabled: org.repos_enabled,
					tablesEnabled: org.tables_enabled,
					workEnabled: org.work_enabled,
					defaultResourcePrivilege: org.default_resource_privilege,
					aiEnabled: org.ai_enabled,
					aiDefaultTokenLimit: Number(org.ai_default_token_limit),
					aiDefaultCharacterLimit: Number(org.ai_default_character_limit),
					aiProviderBaseUrl: org.ai_provider_base_url,
					aiProviderModel: org.ai_provider_model,
					createdAt: org.created_at,
				};
				await tx`INSERT INTO org_event_counter(org) VALUES (${org.id}) ON CONFLICT DO NOTHING`;
				const [counter] = await tx<{ seq: string }[]>`
					UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org.id}
					RETURNING seq::text`;
				const [xact] = await tx<{ txid: string }[]>`
					SELECT pg_current_xact_id()::text AS txid`;
				await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
					VALUES (${org.id}, ${counter.seq}, 'identity:organization-upserted',
						'identity-importer', ${tx.json({ id: org.id, row })}, 1, ${xact.txid})`;
				eventCount++;
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
