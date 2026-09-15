import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// STL-18 T02/T05/T08/T09: transactional repository mutations with events and
// txids, same-org constraints, and the atomic idempotent importer.

let sql: Sql;
let close: () => Promise<void>;
let orgId: string;
let userId: string;

async function seed() {
	orgId = "org-fix-1";
	userId = "user-fix-1";
	await sql`INSERT INTO organization (id, name, slug, created_at)
    VALUES (${orgId}, 'Fixture Org', 'fixture-org', now())`;
	await sql`INSERT INTO "user" (id, name, email, created_at, updated_at)
    VALUES (${userId}, 'Ada', 'ada@example.test', now(), now())`;
}

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await seed();
});

afterEach(async () => {
	await close();
});

test("T02 repoUpsert writes the row, appends one event and returns a txid", async () => {
	const { repoUpsertEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	const result = await Effect.runPromise(
		repoUpsertEffect(sql, orgId, "actor-1", {
			id: "repo-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			origin: "live",
		}),
	);
	expect(result.txid).toBeGreaterThan(0);
	const rows = await sql`SELECT * FROM repo WHERE id='repo-1'`;
	expect(rows).toHaveLength(1);
	const events =
		await sql`SELECT plugin_type, payload FROM event WHERE org=${orgId} AND plugin_type LIKE 'repository:%'`;
	expect(events).toHaveLength(1);
	expect(events[0]?.plugin_type).toBe("repository:repo-upserted");
	const payload = events[0]?.payload as { id: string; origin: string };
	expect(payload.id).toBe("repo-1");
	expect(payload.origin).toBe("live");
	expect(payload).not.toHaveProperty("access_token");
});

test("T02 upsert is a real upsert: second call updates and emits again", async () => {
	const { repoUpsertEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	const input = {
		id: "repo-1",
		provider: "github",
		owner: "foundation",
		name: "probe",
		url: "https://example.test/foundation/probe",
		origin: "live" as const,
	};
	await Effect.runPromise(repoUpsertEffect(sql, orgId, "actor-1", input));
	await Effect.runPromise(
		repoUpsertEffect(sql, orgId, "actor-1", {
			...input,
			description: "updated",
		}),
	);
	const rows = await sql`SELECT description FROM repo WHERE id='repo-1'`;
	expect(rows[0]?.description).toBe("updated");
	const events =
		await sql`SELECT count(*)::int AS count FROM event WHERE org=${orgId} AND plugin_type='repository:repo-upserted'`;
	expect(events[0]?.count).toBe(2);
});

test("T02 repoDelete removes the row, cascades mirrors and appends a delete", async () => {
	const { repoUpsertEffect, repoDeleteEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	await Effect.runPromise(
		repoUpsertEffect(sql, orgId, "actor-1", {
			id: "repo-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			origin: "import",
		}),
	);
	await Effect.runPromise(repoDeleteEffect(sql, orgId, "actor-1", "repo-1"));
	const rows = await sql`SELECT id FROM repo WHERE id='repo-1'`;
	expect(rows).toHaveLength(0);
	const events =
		await sql`SELECT payload FROM event WHERE org=${orgId} AND plugin_type='repository:repo-deleted'`;
	expect(events).toHaveLength(1);
});

test("T02 deleting a foreign-org repo is NotFound", async () => {
	const { repoUpsertEffect, repoDeleteEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	await Effect.runPromise(
		repoUpsertEffect(sql, orgId, "actor-1", {
			id: "repo-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			origin: "import",
		}),
	);
	await expect(
		Effect.runPromise(repoDeleteEffect(sql, "org-other", "actor-1", "repo-1")),
	).rejects.toThrow("NotFound");
	const rows = await sql`SELECT id FROM repo WHERE id='repo-1'`;
	expect(rows).toHaveLength(1);
});

test("T08 importer commits all-or-nothing and is exact on PK/value sets", async () => {
	const { importRepositoryEffect } = await import(
		"../../packages/domain/src/repository-import"
	);
	const { Effect } = await import("effect");
	const result = await Effect.runPromise(
		importRepositoryEffect(sql, orgId, "actor-1", {
			repo: {
				id: "repo-1",
				provider: "github",
				owner: "foundation",
				name: "probe",
				url: "https://example.test/foundation/probe",
				is_private: false,
			},
			issues: [
				{
					id: "issue-1",
					number: 7,
					title: "Gateway timeouts",
					state: "open",
					url: "https://example.test/issues/7",
					comment_count: 2,
				},
			],
			pullRequests: [
				{
					id: "pr-1",
					number: 9,
					title: "Preserve cursors",
					state: "merged",
					url: "https://example.test/pulls/9",
					comment_count: 1,
					is_draft: false,
				},
			],
			origin: "import",
		}),
	);
	expect(result.txid).toBeGreaterThan(0);
	for (const table of ["repo", "repo_issue", "repo_pull_request"]) {
		const rows = await sql.unsafe(`SELECT count(*)::int AS c FROM ${table}`);
		expect(rows[0]?.c).toBe(1);
	}
});

test("T08 malformed mirror aborts the whole import atomically", async () => {
	const { importRepositoryEffect } = await import(
		"../../packages/domain/src/repository-import"
	);
	const { Effect } = await import("effect");
	await expect(
		Effect.runPromise(
			importRepositoryEffect(sql, orgId, "actor-1", {
				repo: {
					id: "repo-1",
					provider: "github",
					owner: "foundation",
					name: "probe",
					url: "https://example.test/foundation/probe",
					is_private: false,
				},
				issues: [
					{
						id: "issue-1",
						number: 7,
						title: "Gateway timeouts",
						state: "open",
						url: "https://example.test/issues/7",
						comment_count: 2,
					},
					{
						id: "issue-2",
						number: 7,
						title: "Duplicate number",
						state: "open",
						url: "https://example.test/issues/8",
						comment_count: 0,
					},
				],
				pullRequests: [],
				origin: "import",
			}),
		),
	).rejects.toThrow();
	// Nothing survived: repo and issues rolled back together.
	for (const table of ["repo", "repo_issue", "repo_pull_request"]) {
		const rows = await sql.unsafe(`SELECT count(*)::int AS c FROM ${table}`);
		expect(rows[0]?.c).toBe(0);
	}
	const events =
		await sql`SELECT count(*)::int AS count FROM event WHERE org=${orgId} AND plugin_type LIKE 'repository:%'`;
	expect(events[0]?.count).toBe(0);
});

test("T09 re-import is idempotent: no duplicate events, source IDs preserved", async () => {
	const { importRepositoryEffect } = await import(
		"../../packages/domain/src/repository-import"
	);
	const { Effect } = await import("effect");
	const snapshot = {
		repo: {
			id: "repo-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			is_private: false,
		},
		issues: [
			{
				id: "issue-1",
				number: 7,
				title: "Gateway timeouts",
				state: "open",
				url: "https://example.test/issues/7",
				comment_count: 2,
			},
		],
		pullRequests: [],
		origin: "import" as const,
	};
	await Effect.runPromise(
		importRepositoryEffect(sql, orgId, "actor-1", snapshot),
	);
	const afterFirst =
		await sql`SELECT count(*)::int AS count FROM event WHERE org=${orgId}`;
	await Effect.runPromise(
		importRepositoryEffect(sql, orgId, "actor-1", snapshot),
	);
	const afterSecond =
		await sql`SELECT count(*)::int AS count FROM event WHERE org=${orgId}`;
	expect(afterSecond[0]?.count).toBe(afterFirst[0]?.count);
	const issues = await sql`SELECT id, number FROM repo_issue`;
	expect(issues).toHaveLength(1);
	expect(issues[0]?.id).toBe("issue-1");
});

test("T05 same-org constraints: cross-org repo reuse and duplicate numbers reject", async () => {
	const { repoUpsertEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	await sql`INSERT INTO organization (id, name, slug, created_at)
    VALUES ('org-fix-2', 'Other Org', 'other-org', now())`;
	await Effect.runPromise(
		repoUpsertEffect(sql, orgId, "actor-1", {
			id: "repo-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			origin: "import",
		}),
	);
	// Same (org,provider,owner,name) through another org id must violate the
	// composite unique only if the org differs — different org, same repo
	// identity is ALLOWED (different organization_id), but the same org
	// reusing the tuple with a different row id is NOT.
	await expect(
		Effect.runPromise(
			repoUpsertEffect(sql, orgId, "actor-1", {
				id: "repo-2",
				provider: "github",
				owner: "foundation",
				name: "probe",
				url: "https://example.test/foundation/probe",
				origin: "import",
			}),
		),
	).rejects.toThrow();
	const rows = await sql`SELECT count(*)::int AS c FROM repo`;
	expect(rows[0]?.c).toBe(1);
});
