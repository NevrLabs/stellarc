import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const repo = (p: string) => join(process.cwd(), p);

async function setupPair() {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const dest = await disposablePostgres();
	const source = await disposablePostgres();
	await migrate(dest.sql);
	await migrate(source.sql);
	// Identity seeds exist on BOTH sides (production: orgs/users pre-exist);
	// only the source carries the fork snapshot's project rows.
	for (const sql of [dest.sql, source.sql]) {
		await sql`INSERT INTO "user" (id, name, email) VALUES ('su1', 'Src Ada', 'ada@src.test')`;
		await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-9', 'Source Org', 'source-org', '2024-01-05 10:00:00')`;
		await sql`INSERT INTO organization_member (id, organization_id, user_id, joined_at) VALUES ('om-9', 'org-9', 'su1', '2024-01-05 10:00:00')`;
	}
	await source.sql`INSERT INTO "user" (id, name, email) VALUES ('ghost', 'Ghost Lead', 'ghost@src.test')`;
	await source.sql`INSERT INTO project (id, organization_id, slug, name, summary, lead_user_id, created_by, created_at, updated_at)
		VALUES ('proj-1', 'org-9', 'legacy-plan', 'Legacy Plan', 'imported row', 'su1', 'su1', '2024-02-01 08:30:00', '2024-03-01 09:00:00')`;
	return { dest, source };
}

test("T02a import: verbatim row, ledger digest, sanitized report", async () => {
	const { importProjects } = await import("../../tools/import-projects");
	const { dest, source } = await setupPair();
	try {
		const [before] =
			await dest.sql`SELECT count(*)::int AS n FROM event WHERE org = 'org-9'`;
		const report = await importProjects(dest.sql, source.sql, "source-fixture");
		const [after] =
			await dest.sql`SELECT count(*)::int AS n FROM event WHERE org = 'org-9'`;

		// the single row, preserved verbatim (ids + timestamps)
		const rows = await dest.sql`SELECT * FROM project WHERE id = 'proj-1'`;
		expect(rows).toHaveLength(1);
		expect(rows[0].slug).toBe("legacy-plan");
		expect((rows[0]["created_at"] as Date).toISOString().slice(0, 16)).toBe(
			"2024-02-01T08:30",
		);
		expect(rows[0]["created_by"]).toBe("su1");
		// source untouched (read-only)
		const [srcRows] = await source.sql`SELECT count(*)::int AS n FROM project`;
		expect(srcRows.n).toBe(1);

		// projection-seed event emitted exactly once
		expect(after.n - before.n).toBe(1);
		const [evt] =
			await dest.sql`SELECT plugin_type FROM event WHERE org = 'org-9'`;
		expect(evt.plugin_type).toBe("project:import-seeded");

		// sanitized report: counts + digest, no imported content
		expect(report.projects).toBe(1);
		expect(report.ledgerDigest).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(report)).not.toContain("Legacy Plan");

		// reconciliation fixture exists and carries the projects obligation
		const fixture = readFileSync(
			repo("tests/fixtures/projects-reconciliation.sql"),
			"utf8",
		);
		expect(fixture).toContain("projects_checked");
	} finally {
		await dest.close();
		await source.close();
	}
});

test("T02b import: idempotent rerun adds zero events", async () => {
	const { importProjects } = await import("../../tools/import-projects");
	const { dest, source } = await setupPair();
	try {
		await importProjects(dest.sql, source.sql, "source-fixture");
		const [before] = await dest.sql`SELECT count(*)::int AS n FROM event`;
		const second = await importProjects(dest.sql, source.sql, "source-fixture");
		const [after] = await dest.sql`SELECT count(*)::int AS n FROM event`;
		expect(after.n).toBe(before.n);
		expect(second.projects).toBe(0);
		const [rows] =
			await dest.sql`SELECT count(*)::int AS n FROM project WHERE id = 'proj-1'`;
		expect(rows.n).toBe(1);
	} finally {
		await dest.close();
		await source.close();
	}
});

test("T02c import: atomic rollback leaves no partial rows (sabotage-detectable)", async () => {
	const { importProjects } = await import("../../tools/import-projects");
	const { dest, source } = await setupPair();
	try {
		// a source row whose lead is missing from the DESTINATION must abort
		// the WHOLE import — no partial commits ('ghost' exists on the source
		// only, so the source-side FK accepts the row)
		await source.sql`INSERT INTO project (id, organization_id, slug, name, summary, lead_user_id, created_by, created_at, updated_at)
			VALUES ('proj-bad', 'org-9', 'bad-lead', 'Bad Lead', 'x', 'ghost', 'su1', now(), now())`;
		await expect(
			importProjects(dest.sql, source.sql, "source-fixture"),
		).rejects.toThrow();
		const [rows] =
			await dest.sql`SELECT count(*)::int AS n FROM project WHERE organization_id = 'org-9'`;
		expect(rows.n).toBe(0);
		const [events] = await dest.sql`SELECT count(*)::int AS n FROM event`;
		expect(events.n).toBe(0);
	} finally {
		await dest.close();
		await source.close();
	}
});

// T17 (projects obligation): the supplementary reconciliation fixture is not a
// dead artifact — every statement EXECUTES against the migrated + imported
// destination and must return its zero-defect count. (All-14 canon + three
// full imports remain wave-2-gated; see .forge-question.md Q2.)
test("T02d reconciliation: supplementary projects fixture executes clean", async () => {
	const { importProjects } = await import("../../tools/import-projects");
	const { dest, source } = await setupPair();
	try {
		await importProjects(dest.sql, source.sql, "source-fixture");

		const fixture = readFileSync(
			repo("tests/fixtures/projects-reconciliation.sql"),
			"utf8",
		);
		// Strip full-line comments BEFORE splitting: the fixture's header
		// comment contains a semicolon, so naive splitting cuts mid-comment.
		const statements = fixture
			.split("\n")
			.filter((line) => !line.trim().startsWith("--"))
			.join("\n")
			.split(";")
			.map((statement) => statement.trim())
			.filter((statement) => statement.length > 0);
		// Frozen fixture shape: round-trip, orphan leads, orphan orgs.
		expect(statements.length).toBe(3);

		const results: Array<Record<string, unknown>> = [];
		for (const statement of statements) {
			const [row] = await dest.sql.unsafe(statement);
			results.push(row as Record<string, unknown>);
		}
		const [roundTrip, orphanLeads, orphanOrgs] = results;

		// The imported project round-trips with all 21 columns intact.
		expect(Number(roundTrip.projects_checked)).toBe(1);
		expect(Number(roundTrip.all_21_columns)).toBe(1);
		// Lead + org integrity: zero orphans after import.
		expect(Number(orphanLeads.orphan_leads)).toBe(0);
		expect(Number(orphanOrgs.orphan_orgs)).toBe(0);
	} finally {
		await dest.close();
		await source.close();
	}
});
