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

describe("R04 blocked semantics and R21 live mode", () => {
	test("hiding a ledger table flips its dependent query green -> blocked", async () => {
		await withRollback(async (tx) => {
			expect(resultFor(await verdicts(tx), 13).verdict).toBe("green");
			await tx.unsafe("DROP TABLE public.identity_import CASCADE");
			const result = resultFor(await verdicts(tx), 13);
			expect(result.verdict).toBe("blocked");
		});
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
