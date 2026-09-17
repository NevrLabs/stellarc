import { Effect } from "effect";
import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	reconciliationViolations,
	repositoryFixture,
	SRC_ORG_A,
	seedSource,
	seedTargetIdentity,
	sourceChecksums,
} from "../helpers/repository-fixture";

// STL-18 T08/T09/T10: the repository importer copies all six tables from a
// production-dump schema (kaneo_src) into the Stellarc tables atomically and
// idempotently, preserving source identifiers; the canonical reconciliation
// query #10 passes on a faithful import and detects its exact violation.

let sql: Sql;
let close: () => Promise<void>;

beforeEach(async () => {
	const db = await repositoryFixture();
	sql = db.sql;
	close = db.close;
	await seedTargetIdentity(sql);
	await seedSource(sql);
});

afterEach(async () => {
	await close();
});

async function runImport() {
	const { importRepositoryDumpEffect } = await import(
		"../../packages/domain/src/repository-import"
	);
	return Effect.runPromise(importRepositoryDumpEffect(sql, "import-actor"));
}

test("T08 importer copies all six tables preserving source ids and values", async () => {
	await runImport();
	const repos =
		await sql`SELECT id, organization_id, provider, owner FROM repo ORDER BY id`;
	expect(repos).toHaveLength(2);
	expect(repos[0]).toMatchObject({ id: "repo-a1", organization_id: SRC_ORG_A });
	const issues =
		(await sql`SELECT id, repo_id, number, state, labels FROM repo_issue ORDER BY id`) as unknown as Array<{
			id: string;
			labels: unknown;
		}>;
	expect(issues.map((i) => i.id)).toEqual(["issue-a1", "issue-a2"]);
	expect(issues[0].labels).toEqual([{ name: "sync", color: "2563eb" }]);
	const prs =
		await sql`SELECT id, state, is_draft, merged_at FROM repo_pull_request ORDER BY id`;
	expect(prs[0]).toMatchObject({ id: "pr-a1", state: "merged" });
	expect(prs[1]).toMatchObject({ id: "pr-b1", is_draft: true });
	const inst =
		await sql`SELECT id, installation_id, account_login FROM organization_github_installation`;
	expect(inst).toHaveLength(1);
	const grants = await sql`SELECT id, access_token FROM github_user_grant`;
	expect(grants[0].access_token).toBe("gho_source_secret_token"); // A3: unchanged
	const integ = await sql`SELECT id, board_id, type, config FROM integration`;
	expect(integ).toHaveLength(1);
	expect(integ[0].config).toContain("installationId");
});

test("T08 importer never writes to the source schema", async () => {
	const before = await sourceChecksums(sql);
	await runImport();
	const after = await sourceChecksums(sql);
	expect(after).toEqual(before);
});

test("T08 malformed FK aborts atomically (no partial rows)", async () => {
	// Source org exists in the dump but was never imported into public: the
	// destination FK must abort the whole import, not skip the row.
	await sql`INSERT INTO kaneo_src.organization (id, name, slug) VALUES ('org-ghost', 'Ghost', 'ghost')`;
	await sql`INSERT INTO kaneo_src.repo (id, organization_id, provider, owner, name, url)
    VALUES ('repo-orphan', 'org-ghost', 'github', 'x', 'y', 'https://x.test/y')`;
	await expect(runImport()).rejects.toThrow();
	const repos = (await sql`SELECT id FROM repo`) as unknown as Array<{
		id: string;
	}>;
	expect(repos.map((r) => r.id)).toEqual([]);
});

test("T08 duplicate mirror key aborts atomically", async () => {
	await sql`INSERT INTO kaneo_src.repo_issue (id, repo_id, number, title, state, url)
    VALUES ('issue-dup', 'repo-a1', 1, 'Duplicate number', 'open', 'https://example.test/i/dup')`;
	await expect(runImport()).rejects.toThrow();
	const issues = await sql`SELECT id FROM repo_issue`;
	expect(issues).toHaveLength(0);
});

test("T09 re-import is idempotent: no duplicate events, ids stable", async () => {
	await runImport();
	const countEvents = async () =>
		(
			(await sql`SELECT count(*)::int AS n FROM event WHERE plugin_type LIKE 'repository:%'`) as unknown as Array<{
				n: number;
			}>
		)[0].n;
	const idsAfterFirst = await sql`SELECT id FROM repo ORDER BY id`;
	const first = await countEvents();
	await runImport();
	const second = await countEvents();
	const idsAfterSecond = await sql`SELECT id FROM repo ORDER BY id`;
	expect(second).toBe(first);
	expect(idsAfterSecond).toEqual(idsAfterFirst);
});

test("T10 canonical reconciliation #10 passes on faithful import", async () => {
	await runImport();
	const violations = await reconciliationViolations(sql);
	expect(violations).toEqual([]);
});

test("T10 canonical reconciliation #10 detects a tampered destination row", async () => {
	await runImport();
	await sql`UPDATE repo_issue SET title = 'tampered' WHERE id = 'issue-a1'`;
	const violations = await reconciliationViolations(sql);
	expect(violations.some((v) => v.kind === "row_digest")).toBe(true);
});
