import type { Sql } from "postgres";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "./postgres";

/** STL-16 shared work fixture (T0 tests/helpers/postgres.ts pattern): one
 * disposable PG + migrated schema + identity seed (org, users, team) + the
 * work slice helpers tests need. Every suite gets an isolated cluster; no
 * production credentials anywhere. */

export type WorkFixture = {
	sql: Sql;
	close: () => Promise<void>;
	/** Bearer header for the test principal grammar ("Bearer <org> <id>"). */
	auth: (org?: string, principal?: string) => Record<string, string>;
	/** Minimal identity seed: one org, two users, one team. */
	seedIdentity: () => Promise<void>;
	/** Create a board through the committed domain path (seeds 4 statuses). */
	createBoard: (
		id: string,
		patch?: { name?: string; slug?: string; org?: string },
	) => Promise<{ id: string; slug: string }>;
};

export async function workFixture(): Promise<WorkFixture> {
	const db = await disposablePostgres();
	const sql = db.sql;
	await migrate(sql);
	const ORG = "fixture-org";
	const seedIdentity = async () => {
		await sql`INSERT INTO organization (id, name, slug, created_at)
			VALUES (${ORG}, 'Fixture Org', 'fixture-org', now())
			ON CONFLICT (id) DO NOTHING`;
		await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES ('fixture-user-1', 'U1', 'u1@fixture.test', true, now(), now())
			ON CONFLICT (id) DO NOTHING`;
		await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES ('fixture-user-2', 'U2', 'u2@fixture.test', true, now(), now())
			ON CONFLICT (id) DO NOTHING`;
		await sql`INSERT INTO team (id, name, organization_id, created_at)
			VALUES ('fixture-team-1', 'T1', ${ORG}, now())
			ON CONFLICT (id) DO NOTHING`;
	};
	await seedIdentity();
	const { createBoard } = await import("../../packages/domain/src/work");
	return {
		sql,
		close: db.close,
		auth: (org = ORG, principal = "fixture-user-1") => ({
			authorization: `Bearer ${org} ${principal}`,
		}),
		seedIdentity,
		createBoard: async (id, patch = {}) => {
			const board = await createBoard(sql, patch.org ?? ORG, "fixture-user-1", {
				id,
				name: patch.name ?? `Board ${id}`,
				slug: patch.slug,
			});
			return { id, slug: board.data.slug };
		},
	};
}
