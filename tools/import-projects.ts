import { createHash } from "node:crypto";
import type { Sql } from "postgres";

const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// The 21 storage columns, in order. Values move verbatim (ids, timestamps).
const PROJECT_COLUMNS = [
	"id",
	"organization_id",
	"slug",
	"name",
	"icon",
	"color",
	"summary",
	"description",
	"success_criteria",
	"status",
	"priority",
	"lead_user_id",
	"lead_team_id",
	"start_date",
	"target_date",
	"org_privilege",
	"archived_at",
	"archived_by",
	"created_at",
	"updated_at",
	"created_by",
] as const;

export type ImportReport = {
	/** Rows inserted by THIS run (0 on an idempotent rerun). */
	projects: number;
	organizations: number;
	/** Digest over the full import ledger for this source. */
	ledgerDigest: string;
	/** Rows verified already-present with a matching digest (skipped). */
	skipped: number;
};

const digestOf = (row: Record<string, unknown>) => {
	const normalized: Record<string, unknown> = {};
	for (const key of Object.keys(row).sort()) {
		const value = row[key];
		normalized[key] =
			value instanceof Date ? value.toISOString() : (value ?? null);
	}
	return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
};

/**
 * Transactional import of the populated `project` rows from the pinned fork
 * snapshot. Read-only on the source; one destination transaction; the
 * identity_import ledger makes reruns idempotent (zero new events); the
 * projection-seed event fires exactly once per organization. The report is
 * sanitized: counts and digests only, never imported content.
 */
export async function importProjects(
	sql: Sql,
	sourceSql: Sql,
	sourceId: string,
): Promise<ImportReport> {
	// --- Preflight (destination shape) -------------------------------------
	const [{ count: columnCount }] = (await sql`
		SELECT count(*)::int AS count FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'project'`) as [
		{ count: number },
	];
	if (columnCount !== 21)
		throw new Error(
			`Preflight failed: destination project table has ${columnCount} columns, expected 21`,
		);
	// Satellites are designed fresh (wave 2, Q1) — they must NOT exist here.
	const satellites = await sql`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public'
		AND table_name IN ('project_ticket', 'project_board', 'project_repo', 'project_table_link')`;
	if (satellites.length > 0)
		throw new Error(
			`Preflight failed: satellite tables present (${satellites.map((t) => t.table_name).join(", ")})`,
		);

	// --- Source read (read-only, outside the destination tx) ----------------
	const rows = (await sourceSql.unsafe(
		`SELECT ${PROJECT_COLUMNS.join(", ")} FROM project ORDER BY id`,
	)) as unknown as Array<Record<string, unknown>>;

	let inserted = 0;
	const seenOrgs = new Set<string>();
	let skipped = 0;

	await sql.begin(async (tx) => {
		for (const row of rows) {
			const digest = digestOf(row);
			const [ledgered] = await tx`
				SELECT digest FROM identity_import
				WHERE source_id = ${sourceId} AND table_name = 'project' AND source_pk = ${row.id as string}`;
			if (ledgered) {
				if (ledgered.digest === digest) {
					skipped += 1;
					continue;
				}
				throw new Error(
					`Ledger conflict: project ${row.id as string} changed since import`,
				);
			}

			// --- Preflight (row-level FK targets and formats) -----------------
			const slug = row.slug as string;
			if (!SLUG_PATTERN.test(slug) || slug.length > 63)
				throw new Error(
					`Preflight failed: invalid slug ${JSON.stringify(slug)}`,
				);
			const org = row.organization_id as string;
			const [{ count: orgCount }] = (await tx`
				SELECT count(*)::int AS count FROM organization WHERE id = ${org}`) as [
				{ count: number },
			];
			if (orgCount !== 1)
				throw new Error(`Preflight failed: organization ${org} missing`);
			const [{ count: leadCount }] = (await tx`
				SELECT count(*)::int AS count FROM organization_member
				WHERE organization_id = ${org} AND user_id = ${row.lead_user_id as string}`) as [
				{ count: number },
			];
			if (leadCount !== 1)
				throw new Error(
					`Preflight failed: lead user ${row.lead_user_id as string} not a member of ${org}`,
				);

			// --- Verbatim insert ----------------------------------------------
			const values = PROJECT_COLUMNS.map((column) => row[column] ?? null);
			await tx.unsafe(
				`INSERT INTO project (${PROJECT_COLUMNS.join(", ")}) VALUES (${PROJECT_COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})`,
				values as never[],
			);
			await tx`
				INSERT INTO identity_import (source_id, table_name, source_pk, digest)
				VALUES (${sourceId}, 'project', ${row.id as string}, ${digest})`;
			seenOrgs.add(org);
			inserted += 1;
		}

		// Projection-seed event: once per org per import, inside the same tx.
		for (const org of seenOrgs) {
			const [existing] = await tx`
				SELECT 1 FROM event WHERE org = ${org} AND plugin_type = 'project:import-seeded' LIMIT 1`;
			if (existing) continue;
			await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
			const [counter] =
				await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text`;
			const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
			await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
				VALUES (${org}, ${counter.seq}, 'project:import-seeded', 'import', ${tx.json({ organizationId: org } as never)}, 1, ${transaction.txid})`;
		}
	});

	const ledger = await sql`
		SELECT source_pk, digest FROM identity_import WHERE source_id = ${sourceId} ORDER BY source_pk`;
	const ledgerDigest = createHash("sha256")
		.update(JSON.stringify(ledger.map((l) => [l.source_pk, l.digest])))
		.digest("hex");

	return {
		projects: inserted,
		organizations: seenOrgs.size,
		ledgerDigest,
		skipped,
	};
}
