import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { loadManifest, type Manifest } from "../../tools/reconciliation/canon";
import {
	aggregate,
	applySabotage,
	type QueryResult,
	restoreFixtures,
	runCanonProof,
	runCanonProofEffect,
	writeReport,
} from "../../tools/reconciliation/run";
import { disposablePostgres } from "../helpers/postgres";

const manifest: Manifest = await loadManifest();

function resultFor(results: QueryResult[], id: number): QueryResult {
	const found = results.find((r) => r.id === id);
	if (!found) throw new Error(`query ${id} missing from results`);
	return found;
}

let cluster: Awaited<ReturnType<typeof disposablePostgres>>;

beforeAll(async () => {
	cluster = await disposablePostgres();
	await restoreFixtures(cluster.sql);
});

afterAll(async () => {
	await cluster.close();
});

const ROLLBACK = Symbol("rollback");

// Run `fn` against the shared restored fixture inside a transaction that is always
// rolled back, so sabotage mutations never leak between tests and no re-restore is
// needed. `tx` supports the same `.unsafe()` and tagged-template surface as `Sql`.
async function withRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
	let result!: T;
	try {
		await cluster.sql.begin(async (tx) => {
			result = await fn(tx as unknown as Sql);
			throw ROLLBACK;
		});
	} catch (error) {
		if (error !== ROLLBACK) throw error;
	}
	return result;
}

async function verdicts(sql: Sql) {
	return runCanonProof(sql, manifest);
}

describe("R02/R04 fixture restore and R05–R16 canon-proof green", () => {
	test("golden pair restores and every query is green with zero violation rows", async () => {
		// R02: legacy snapshot restored with the pinned fork table set
		const legacy = await cluster.sql`
      SELECT to_regclass('legacy.user') IS NOT NULL AS u,
             to_regclass('legacy.apikey') IS NOT NULL AS k,
             to_regclass('legacy.task') IS NOT NULL AS t`;
		expect(legacy[0]).toEqual({ u: true, k: true, t: true });
		// R02: manifest-declared row counts present after restore (both sides)
		const mismatches: Array<Record<string, unknown>> = [];
		for (const [side, tables] of [
			["legacy", manifest.legacy_tables],
			["public", manifest.destination_tables],
		] as const) {
			for (const [table, expected] of Object.entries(tables)) {
				const [row] = await cluster.sql`SELECT count(*)::int AS actual
          FROM ${cluster.sql(side)}.${cluster.sql(table)}`;
				if (row.actual !== expected)
					mismatches.push({ side, table, expected, actual: row.actual });
			}
		}
		expect(mismatches, JSON.stringify(mismatches)).toEqual([]);
		// R04: destination golden restored; T0 foundation present
		const dest = await cluster.sql`
      SELECT to_regclass('public.event') IS NOT NULL AS e,
             to_regclass('public.org_event_counter') IS NOT NULL AS c,
             to_regclass('public.identity_import') IS NOT NULL AS i`;
		expect(dest[0]).toEqual({ e: true, c: true, i: true });
		const results = await verdicts(cluster.sql);
		expect(results).toHaveLength(14);
		for (const r of results) {
			expect(r.verdict, `query ${r.id}`).toBe("green");
			expect(r.violations, `query ${r.id}`).toBe(0);
		}
	});
});

describe("R05–R16 per-query sabotage negative controls", () => {
	for (const q of manifest.queries) {
		for (const sabotage of q.sabotages) {
			test(`query ${q.id} turns red under ${sabotage.split("/").pop()}`, async () => {
				await withRollback(async (tx) => {
					expect(resultFor(await verdicts(tx), q.id).verdict).toBe("green");
					await applySabotage(tx, sabotage);
					const result = resultFor(await verdicts(tx), q.id);
					expect(result.verdict).toBe("red");
					expect(result.violations).toBeGreaterThan(0);
				});
			});
		}
	}
});

describe("R17 query #13 id bijection", () => {
	test("green on golden; red independently under 13a and under 13b", async () => {
		await withRollback(async (tx) => {
			expect(resultFor(await verdicts(tx), 13).verdict).toBe("green");
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/13a.sql");
			const a = resultFor(await verdicts(tx), 13);
			expect(a.verdict).toBe("red");
			expect(a.violations).toBeGreaterThan(0);
		});
		await withRollback(async (tx) => {
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/13b.sql");
			const b = resultFor(await verdicts(tx), 13);
			expect(b.verdict).toBe("red");
			expect(b.violations).toBeGreaterThan(0);
		});
	});
});

describe("R18/R20 query #14 apikey hash audit", () => {
	test("preserved-hash arm green; 14a corrupt-hash red; 14b reissue-without-event red", async () => {
		await withRollback(async (tx) => {
			expect(resultFor(await verdicts(tx), 14).verdict).toBe("green");
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/14a.sql");
			const a = resultFor(await verdicts(tx), 14);
			expect(a.verdict).toBe("red");
			expect(a.violations).toBeGreaterThan(0);
		});
		await withRollback(async (tx) => {
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/14b.sql");
			const b = resultFor(await verdicts(tx), 14);
			expect(b.verdict).toBe("red");
			expect(b.violations).toBeGreaterThan(0);
		});
	});
});

describe("R05b fidelity arms — previously uncompared columns (review D5)", () => {
	// One test per defect-named column group. Each first mutates the golden
	// destination, then asserts the owning query turns red — proving the canon
	// compares the column. Before D5 these mutations stayed green.
	const cases: Array<[number, string, string]> = [
		[
			1,
			"account",
			"UPDATE public.account SET access_token_expires_at = '2020-01-01' WHERE id = 'a1'",
		],
		[
			2,
			"invitation",
			"UPDATE public.invitation SET expires_at = '2030-01-01' WHERE id = 'inv1'",
		],
		[
			3,
			"apikey",
			"UPDATE public.apikey SET last_refill_at = '2025-05-05', last_request = '2025-05-06' WHERE id = 'k1'",
		],
		[
			4,
			"board",
			"UPDATE public.board SET created_at = '2019-01-01' WHERE id = 'b1'",
		],
		[
			7,
			"milestone",
			"UPDATE public.milestone SET completed_at = '2025-01-01' WHERE id = 'ms1'",
		],
		[
			10,
			"repo",
			"UPDATE public.repo SET last_synced_at = '2025-06-01' WHERE id = 'repo1'",
		],
		[
			10,
			"repo_issue",
			"UPDATE public.repo_issue SET author_avatar_url = 'https://avatars/x', external_created_at = '2025-01-01', closed_at = '2025-01-02' WHERE id = 'issue1'",
		],
		[
			10,
			"repo_pull_request",
			"UPDATE public.repo_pull_request SET labels = '[\"bug\"]', additions = 10, deletions = 2, changed_files = 3, merged_at = '2025-01-01', closed_at = '2025-01-02', external_created_at = '2025-01-03', external_updated_at = '2025-01-04' WHERE id = 'pr1'",
		],
		[
			10,
			"github_user_grant",
			"UPDATE public.github_user_grant SET access_token_expires_at = '2025-01-01', refresh_token = 'rt', refresh_token_expires_at = '2025-02-01', scope = 'repo' WHERE id = 'ghgrant1'",
		],
		[
			10,
			"integration",
			"UPDATE public.integration SET created_at = '2019-01-01' WHERE id = 'integ1'",
		],
		[
			10,
			"installation",
			"UPDATE public.organization_github_installation SET account_avatar_url = 'https://avatars/y', repository_selection = 'selected' WHERE id = 'install1'",
		],
		[
			9,
			"asset",
			"UPDATE public.asset SET created_at = '2019-01-01' WHERE id = 'asset1'",
		],
	];
	for (const [id, tbl, mutation] of cases) {
		test(`query ${id} compares ${tbl} columns the c1 corpus omitted`, async () => {
			await withRollback(async (tx) => {
				await tx.unsafe(mutation);
				const result = resultFor(await verdicts(tx), id);
				expect(result.verdict, mutation).toBe("red");
				expect(result.violations, mutation).toBeGreaterThan(0);
			});
		});
	}
});

describe("R20b #14 re-issue contract strictness (review D8)", () => {
	test("event with matching id but wrong reason or principalId does not satisfy the audit", async () => {
		await withRollback(async (tx) => {
			// flip k1 to re-issue state (hash differs) with a WRONG-reason event
			await tx`UPDATE public.apikey SET key = 'not-the-fork-hash-format-but-exactly-43-chars-long-x' WHERE id = 'k1'`;
			await tx`INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid)
        VALUES ('o1', 2, 'identity:apikey-reissued', 'u1', ${{ id: "k1", principalId: "p2", reason: "wrong-reason" }}, 1, 1)`;
			const result = resultFor(await verdicts(tx), 14);
			expect(result.verdict).toBe("red");
		});
	});

	test("preserved hash AND a well-formed reissue event is a both-arms violation", async () => {
		await withRollback(async (tx) => {
			await tx`INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid)
        VALUES ('o1', 2, 'identity:apikey-reissued', 'u1', ${{ id: "k1", principalId: "p2", reason: "legacy-reissue" }}, 1, 1)`;
			const result = resultFor(await verdicts(tx), 14);
			expect(result.verdict).toBe("red");
			expect(result.violations).toBeGreaterThan(0);
		});
	});

	test("re-issued key WITH exactly one well-formed event is green", async () => {
		await withRollback(async (tx) => {
			await tx`UPDATE public.apikey SET key = 'not-the-fork-hash-format-but-exactly-43-chars-long-x' WHERE id = 'k1'`;
			await tx`INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid)
        VALUES ('o1', 2, 'identity:apikey-reissued', 'u1', ${{ id: "k1", principalId: "p2", reason: "legacy-reissue" }}, 1, 1)`;
			const result = resultFor(await verdicts(tx), 14);
			expect(result.verdict).toBe("green");
		});
	});
});

describe("R04 blocked semantics and R21 live mode", () => {
	test("hiding a ledger table flips its dependent query green -> blocked", async () => {
		await withRollback(async (tx) => {
			expect(resultFor(await verdicts(tx), 13).verdict).toBe("green");
			await tx.unsafe("DROP TABLE public.identity_import CASCADE");
			const result = resultFor(await verdicts(tx), 13);
			expect(result.verdict).toBe("blocked");
		});
	});

	test("R02 negative control: a missing row in a restored table fails the count check", async () => {
		// The row-count assertion above must be able to fail: remove one row from a
		// restored legacy table and confirm the count mismatch is detectable.
		await withRollback(async (tx) => {
			const before = await tx`SELECT count(*)::int AS n FROM legacy.task`;
			await tx`DELETE FROM legacy.task WHERE id = 'task3'`;
			const mismatches = await tx`
        SELECT (SELECT count(*) FROM legacy.task)::int AS actual,
               ${manifest.legacy_tables.task}::int AS expected`;
			expect(mismatches[0].actual).not.toBe(mismatches[0].expected);
			expect(before[0].n).toBe(mismatches[0].expected);
		});
	});

	test("R04 regression: dropping a SQL-referenced table yields verdict blocked, never a crash", async () => {
		// D4: 05-ticket.sql references legacy.board/board_key_alias and
		// 12-isolation.sql references public.asset/public.repo; dropping any of
		// them must flip the dependent query to blocked, not reject the harness.
		const cases: Array<[number, string]> = [
			[5, "legacy.board"],
			[5, "legacy.board_key_alias"],
			[12, "public.asset"],
			[12, "public.repo"],
		];
		for (const [id, table] of cases) {
			await withRollback(async (tx) => {
				await tx.unsafe(`DROP TABLE ${table} CASCADE`);
				const result = resultFor(await verdicts(tx), id);
				expect(result.verdict, `query ${id} under dropped ${table}`).toBe(
					"blocked",
				);
			});
		}
	});

	test("live mode with no merged importer reports blocked, never green/red; all-blocked is failure", async () => {
		const name = `recon_${crypto.randomUUID().replace(/-/g, "")}`;
		await cluster.sql.unsafe(`CREATE DATABASE ${name}`);
		const socket = cluster.sql.options.host[0];
		const sql = postgres({
			host: socket,
			username: "stellarc_owner",
			database: name,
			max: 8,
			onnotice: () => {},
		});
		try {
			await migrate(sql); // T0 only — no destination domain/ledger tables
			const results = await verdicts(sql);
			expect(results).toHaveLength(14);
			for (const r of results) {
				expect(r.verdict).toBe("blocked");
			}
			const { red, blocked, allBlocked } = aggregate(results);
			expect(red).toBe(0);
			expect(blocked).toBe(14);
			expect(allBlocked).toBe(true);
			// all-blocked is a harness failure, not success
			expect(red > 0 || allBlocked).toBe(true);
		} finally {
			await sql.end();
			await cluster.sql.unsafe(`DROP DATABASE IF EXISTS ${name}`);
		}
	});
});

describe("R22 spans", () => {
	test("each query exports a stellarc.reconcile.query span with id/mode/verdict/violations and no PII", async () => {
		const { TelemetryTest } = await import(
			"../../packages/telemetry/src/index"
		);
		const telemetry = TelemetryTest();
		const runtime = ManagedRuntime.make(telemetry.layer);
		try {
			await runtime.runPromise(runCanonProofEffect(cluster.sql, manifest));
			const spans = telemetry.spans
				.getFinishedSpans()
				.filter((span) => span.name === "stellarc.reconcile.query");
			expect(spans).toHaveLength(14);
			for (const span of spans) {
				const attributes = span.attributes as Record<string, unknown>;
				expect(attributes["stellarc.reconcile.query_id"]).toBeTypeOf("number");
				expect(attributes["stellarc.reconcile.mode"]).toBe("canon-proof");
				expect(["green", "red", "blocked"]).toContain(
					attributes["stellarc.reconcile.verdict"],
				);
				expect(attributes["stellarc.reconcile.violations"]).toBeTypeOf(
					"number",
				);
				expect(JSON.stringify(attributes)).not.toMatch(
					/a@x\.com|bcrypt-hash|gh-token|sk-a|stl27-known-answer/,
				);
				expect(JSON.stringify(attributes)).not.toContain("SELECT");
			}
		} finally {
			await runtime.dispose();
		}
	});
});

describe("R23 report and exit contract", () => {
	test("report writes JSON without PII and aggregates red/all-blocked", async () => {
		const dir = await mkdtemp(join(tmpdir(), "stellarc-report-"));
		try {
			const results = await verdicts(cluster.sql);
			const path = await writeReport(results, dir);
			const text = await readFile(path, "utf8");
			const parsed = JSON.parse(text) as QueryResult[];
			expect(parsed).toHaveLength(14);
			expect(text).not.toMatch(/a@x\.com|bcrypt-hash|gh-token|sk-a/);
			expect(aggregate(results)).toEqual({
				red: 0,
				blocked: 0,
				allBlocked: false,
			});
			// flip one verdict to red -> nonzero exit semantics
			results[0] = { ...results[0], verdict: "red", violations: 1 };
			expect(aggregate(results).red).toBe(1);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
