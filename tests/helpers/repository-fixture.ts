import { readFile } from "node:fs/promises";
import type { Sql } from "postgres";
import { disposablePostgres } from "./postgres";

// STL-18 T08/T09/T10 fixture: a disposable Postgres with the Stellarc
// migrations applied plus a `kaneo_src` schema mirroring the production dump
// shape, seeded with a deterministic two-org dataset spanning all six
// import tables (repo, repo_issue, repo_pull_request,
// organization_github_installation, github_user_grant, integration).

export const SRC_ORG_A = "org-import-a";
export const SRC_ORG_B = "org-import-b";
export const SRC_USER = "user-import-1";
export const SRC_BOARD = "board-import-1";

export type SourceChecksums = Record<string, string>;

export async function repositoryFixture() {
	const db = await disposablePostgres();
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(db.sql);
	await createSourceSchema(db.sql);
	return {
		sql: db.sql,
		async close() {
			await db.close();
		},
	};
}

export async function createSourceSchema(sql: Sql) {
	await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
	await sql`CREATE SCHEMA IF NOT EXISTS kaneo_src`;
	const source = await readFile(
		new URL("../fixtures/kaneo-src-schema.sql", import.meta.url),
		"utf8",
	);
	await sql.unsafe(source.replace(/kaneo_src\./g, "kaneo_src."));
}

export async function seedSource(sql: Sql) {
	await sql`INSERT INTO kaneo_src.organization (id, name, slug) VALUES
    (${SRC_ORG_A}, 'Import A', 'import-a'), (${SRC_ORG_B}, 'Import B', 'import-b')`;
	await sql`INSERT INTO kaneo_src."user" (id, name, email) VALUES
    (${SRC_USER}, 'Ada Import', 'ada@import.test')`;
	await sql`INSERT INTO kaneo_src.board (id, organization_id, name) VALUES
    (${SRC_BOARD}, ${SRC_ORG_A}, 'Import Board')`;
	await sql`INSERT INTO kaneo_src.repo (id, organization_id, provider, owner, name, url, description, is_private, created_at, updated_at) VALUES
    ('repo-a1', ${SRC_ORG_A}, 'github', 'foundation', 'probe', 'https://example.test/foundation/probe', 'Mirror probe', false,
      '2026-01-01T10:00:00Z', '2026-01-02T10:00:00Z'),
    ('repo-b1', ${SRC_ORG_B}, 'gitea', 'other', 'mirror', 'https://example.test/other/mirror', NULL, true,
      '2026-01-03T10:00:00Z', '2026-01-03T10:00:00Z')`;
	await sql`INSERT INTO kaneo_src.repo_issue (id, repo_id, number, title, body, state, author_login, labels, comment_count, url, external_created_at, created_at, updated_at) VALUES
    ('issue-a1', 'repo-a1', 1, 'Alpha issue', 'Body of alpha', 'open', 'ada-fixture', '[{"name":"sync","color":"2563eb"}]'::jsonb, 2, 'https://example.test/i/1', '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z'),
    ('issue-a2', 'repo-a1', 2, 'Beta issue', NULL, 'closed', NULL, NULL, 0, 'https://example.test/i/2', '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z', '2026-01-02T12:00:00Z')`;
	await sql`INSERT INTO kaneo_src.repo_pull_request (id, repo_id, number, title, body, state, is_draft, head_branch, base_branch, additions, deletions, changed_files, url, merged_at, created_at, updated_at) VALUES
    ('pr-a1', 'repo-a1', 7, 'Merged PR', 'Closes alpha', 'merged', false, 'fix/alpha', 'main', 42, 7, 2, 'https://example.test/p/7', '2026-01-04T10:00:00Z', '2026-01-03T10:00:00Z', '2026-01-04T10:00:00Z'),
    ('pr-b1', 'repo-b1', 8, 'Open draft PR', NULL, 'open', true, 'wip', 'main', NULL, NULL, NULL, 'https://example.test/p/8', NULL, '2026-01-05T10:00:00Z', '2026-01-05T10:00:00Z')`;
	await sql`INSERT INTO kaneo_src.organization_github_installation (id, organization_id, installation_id, account_id, account_login, account_type, repository_selection, permissions, created_at, updated_at) VALUES
    ('inst-a1', ${SRC_ORG_A}, 1001, 2001, 'foundation', 'Organization', 'selected', '{"issues":"write"}'::jsonb, '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')`;
	await sql`INSERT INTO kaneo_src.github_user_grant (id, user_id, provider_id, github_user_id, github_login, access_token, refresh_token, scope, created_at, updated_at) VALUES
    ('grant-1', ${SRC_USER}, 'github', '3001', 'ada-fixture', 'gho_source_secret_token', NULL, 'repo,read:org', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')`;
	await sql`INSERT INTO kaneo_src.integration (id, board_id, type, config, is_active, created_at, updated_at) VALUES
    ('integ-1', ${SRC_BOARD}, 'github', '{"installationId":1001}', true, '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')`;
}

/** Post-import target rows the source expects (org A + shared user/board rows). */
export async function seedTargetIdentity(sql: Sql) {
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES
    (${SRC_ORG_A}, 'Import A', 'import-a', now()), (${SRC_ORG_B}, 'Import B', 'import-b', now())
    ON CONFLICT (id) DO NOTHING`;
	await sql`INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES
    (${SRC_USER}, 'Ada Import', 'ada@import.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
}

/** sha256 inventory of the source schema (all six tables) — source is read-only. */
export async function sourceChecksums(sql: Sql): Promise<SourceChecksums> {
	const tables = [
		"repo",
		"repo_issue",
		"repo_pull_request",
		"organization_github_installation",
		"github_user_grant",
		"integration",
	];
	const out: SourceChecksums = {};
	for (const table of tables) {
		const rows = await sql.unsafe(
			`SELECT count(*)::int AS n, coalesce(string_agg(id, ',' ORDER BY id), '') AS ids
       FROM kaneo_src."${table}"`,
		);
		out[table] = `${rows[0].n}:${rows[0].ids}`;
	}
	return out;
}

/** The canonical reconciliation query #10 (fixture-owned text). */
export async function reconciliationViolations(sql: Sql) {
	const query = await readFile(
		new URL("../fixtures/repository-reconciliation.sql", import.meta.url),
		"utf8",
	);
	return (await sql.unsafe(query)) as Array<{
		organization_id: string | null;
		kind: string;
		src_n: string | number;
		dst_n: string | number;
	}>;
}
