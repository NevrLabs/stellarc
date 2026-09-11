// Reconciliation harness runner.
//
// Two modes:
//   - canon-proof: restore the synthetic legacy + destination golden pair and run all
//     14 queries. Verdicts are labelled `canon-proof` and are NEVER reported as wave
//     reconciliation PASS.
//   - live: (identity-only at this merge point, blocked-by STL-15) — a live destination
//     has no merged importer, so every query reports `blocked`.
//
// Instrumentation (ADR 0010): Effect service methods with span `stellarc.reconcile.query`
// and attributes query_id / mode / verdict / violations; no SQL text or PII in span
// attributes; no console.* in service code.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import type { Sql } from "postgres";
import { disposablePostgres } from "../../tests/helpers/postgres.ts";
import {
	loadManifest,
	loadQueryText,
	loadSabotageText,
	type Manifest,
	repoRoot,
} from "./canon.ts";

export type Verdict = "green" | "red" | "blocked";
export type Mode = "canon-proof" | "live";

export interface QueryResult {
	id: number;
	mode: Mode;
	verdict: Verdict;
	violations: number;
	blockedReason?: string;
}

function quoteIdent(qualified: string): string {
	return qualified
		.split(".")
		.map((part) => `"${part.replace(/"/g, '""')}"`)
		.join(".");
}

async function preconditionMissing(
	sql: Sql,
	preconditions: string[],
): Promise<string | null> {
	for (const precondition of preconditions) {
		const [row] =
			await sql`SELECT to_regclass(${quoteIdent(precondition)}) IS NULL AS missing`;
		if (row?.missing) return precondition;
	}
	return null;
}

function queryEffect(
	sql: Sql,
	id: number,
	mode: Mode,
	text: string,
	preconditions: string[],
) {
	return Effect.gen(function* () {
		const missing = yield* Effect.tryPromise(() =>
			preconditionMissing(sql, preconditions),
		);
		if (missing) {
			yield* Effect.annotateCurrentSpan("stellarc.reconcile.query_id", id);
			yield* Effect.annotateCurrentSpan("stellarc.reconcile.mode", mode);
			yield* Effect.annotateCurrentSpan(
				"stellarc.reconcile.verdict",
				"blocked",
			);
			yield* Effect.annotateCurrentSpan("stellarc.reconcile.violations", 0);
			return {
				id,
				mode,
				verdict: "blocked" as const,
				violations: 0,
				blockedReason: missing,
			};
		}
		const rows = yield* Effect.tryPromise(() =>
			sql.unsafe(text).then((result) => (Array.isArray(result) ? result : [])),
		);
		const violations = rows.length;
		const verdict: Verdict = violations === 0 ? "green" : "red";
		yield* Effect.annotateCurrentSpan("stellarc.reconcile.query_id", id);
		yield* Effect.annotateCurrentSpan("stellarc.reconcile.mode", mode);
		yield* Effect.annotateCurrentSpan("stellarc.reconcile.verdict", verdict);
		yield* Effect.annotateCurrentSpan(
			"stellarc.reconcile.violations",
			violations,
		);
		return { id, mode, verdict, violations };
	}).pipe(Effect.withSpan("stellarc.reconcile.query"));
}

export function runCanonProofEffect(sql: Sql, manifest: Manifest) {
	return Effect.gen(function* () {
		const results: QueryResult[] = [];
		for (const q of manifest.queries) {
			const text = yield* Effect.tryPromise(() => loadQueryText(q.file));
			results.push(
				yield* queryEffect(sql, q.id, "canon-proof", text, q.preconditions),
			);
		}
		return results;
	}).pipe(Effect.withSpan("ReconcileRunner.canonProof"));
}

export function runCanonProof(
	sql: Sql,
	manifest: Manifest,
): Promise<QueryResult[]> {
	return Effect.runPromise(runCanonProofEffect(sql, manifest));
}

export async function applySabotage(
	sql: Sql,
	sabotageFile: string,
): Promise<void> {
	const text = await loadSabotageText(sabotageFile);
	await sql.unsafe(text);
}

export async function restoreFixtures(sql: Sql): Promise<string> {
	const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
	const socketDir = sql.options.host[0];
	const database = sql.options.database ?? "postgres";
	const fixtures = join(repoRoot(), "tests", "fixtures", "reconciliation");
	for (const dump of [
		"legacy-snapshot.pgdump",
		"stellarc-destination-golden.pgdump",
	]) {
		execFileSync(
			join(bin, "pg_restore"),
			[
				"-h",
				socketDir,
				"-U",
				"stellarc_owner",
				"-d",
				database,
				"--no-owner",
				join(fixtures, dump),
			],
			{ stdio: "pipe" },
		);
	}
	return socketDir;
}

export function aggregate(results: QueryResult[]): {
	red: number;
	blocked: number;
	allBlocked: boolean;
} {
	const red = results.filter((r) => r.verdict === "red").length;
	const blocked = results.filter((r) => r.verdict === "blocked").length;
	return { red, blocked, allBlocked: blocked === results.length };
}

export async function writeReport(
	results: QueryResult[],
	artifactsDir: string,
): Promise<string> {
	await mkdir(artifactsDir, { recursive: true });
	const path = join(artifactsDir, "reconciliation-report.json");
	await writeFile(path, `${JSON.stringify(results, null, 2)}\n`);
	return path;
}

async function main() {
	const manifest = await loadManifest();
	const db = await disposablePostgres();
	try {
		await restoreFixtures(db.sql);
		const results = await runCanonProof(db.sql, manifest);
		const { red, allBlocked } = aggregate(results);
		await writeReport(results, process.env.ARTIFACTS_DIR ?? process.cwd());
		process.exitCode = red > 0 || allBlocked ? 1 : 0;
	} finally {
		await db.close();
	}
}

if (import.meta.main) {
	main().catch((error) => {
		process.stderr.write(`${error}\n`);
		process.exitCode = 1;
	});
}
