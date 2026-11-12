/**
 * NEVR-553 review defect 3: drizzle's node-postgres migrator skips any journal
 * entry whose `when` is not strictly greater than the last applied migration's
 * timestamp. 0078 originally reused 0077's `when` (1788316800000), so every
 * database already sitting at 0077 would silently skip the better-auth 1.7
 * columns and break at runtime. This test migrates a real database to 0077
 * only, then runs the full migrator and proves 0078 lands.
 */
import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { disposablePostgres } from "../helpers/postgres";

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, "../../packages/kaneo-legacy/drizzle");

test("0078 applies on a database already migrated to 0077 (upgrade path)", async () => {
	const db = await disposablePostgres();
	const opts = db.sql.options as unknown as {
		host: string[];
		database: string;
		user: string;
	};
	const url = `postgresql://${opts.user}@localhost/${opts.database}?host=${encodeURIComponent(opts.host[0])}`;
	const pool = new Pool({ connectionString: url, max: 1 });
	const drz = drizzle(pool);
	try {
		// A copy of the migration folder truncated at idx 77 — the state of a
		// production database that had already applied everything before the
		// better-auth 1.7 bump shipped.
		const folder = await mkdtemp(join(tmpdir(), "kaneo-journal-0077-"));
		await cp(drizzleDir, folder, { recursive: true });
		const journalPath = join(folder, "meta/_journal.json");
		const journal = JSON.parse(await readFile(journalPath, "utf8"));
		journal.entries = journal.entries.filter(
			(e: { idx: number }) => e.idx <= 77,
		);
		await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
		await migrate(drz, { migrationsFolder: folder });

		const columnsAt0077 = await pool.query<{ column_name: string }>(
			"SELECT column_name FROM information_schema.columns WHERE table_name = 'team' AND column_name = 'member_count'",
		);
		expect(columnsAt0077.rows).toHaveLength(0);

		// The full migrator (journal now carries idx 78 with a strictly
		// greater `when`) must apply 0078 on top of the 0077 database.
		await migrate(drz, { migrationsFolder: drizzleDir });

		const team = await pool.query<{
			column_name: string;
			column_default: string;
		}>(
			"SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'team' AND column_name = 'member_count'",
		);
		expect(team.rows).toHaveLength(1);
		expect(team.rows[0].column_default).toContain("0");
		const membershipKey = await pool.query<{ column_name: string }>(
			"SELECT column_name FROM information_schema.columns WHERE table_name = 'team_member' AND column_name = 'membership_key'",
		);
		expect(membershipKey.rows).toHaveLength(1);
		const applied = await pool.query<{ count: string }>(
			"SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
		);
		const journalEntries = JSON.parse(
			await readFile(join(drizzleDir, "meta/_journal.json"), "utf8"),
		).entries.length;
		expect(Number(applied.rows[0].count)).toBe(journalEntries);
	} finally {
		await pool.end();
		await db.close();
	}
});
