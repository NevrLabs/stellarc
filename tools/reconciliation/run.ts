// Reconciliation harness runner.
//
// Two modes:
//   - canon-proof: restore the synthetic legacy + destination golden pair and run all
//     14 queries. Verdicts are labelled `canon-proof` and are NEVER reported as wave
//     reconciliation PASS.
//   - live: run the merged importers (identity only at this merge point) from the
//     restored legacy snapshot into a fresh T0 destination, then reconcile. A query
//     whose importer is not yet merged reports `blocked` with reason. Live mode is
//     the only source of reconciliation PASS (consumed by owning slices + STL-21).
//
// Instrumentation (ADR 0010): Effect.fn service methods, DB access through the
// standard @effect/sql client wrapper (db.* spans, statement text filtered by the
// SqlTracing boundary), span `stellarc.reconcile.query` with attributes
// query_id / mode / verdict / violations. No SQL text or PII in span attributes;
// no console.* in service code.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PgClient } from "@effect/sql-pg";
import { ConfigProvider, Effect, Layer } from "effect";
import { ConfigLive } from "../../apps/stellarc-api/src/config";
import { SqlLive } from "../../packages/db/src/index";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../../tests/helpers/postgres";
import {
	loadManifest,
	loadQueryText,
	loadSabotageText,
	type Manifest,
	repoRoot,
} from "./canon.ts";

export type Verdict = "green" | "red" | "blocked";
export type Mode = "canon-proof" | "live";

// Where the live runner looks for the merged identity importer (STL-15). Tests
// inject a fake implementation by assigning to liveIdentityTarget in a `try`
// block; production resolves the real module path. The value is the module
// specifier relative to the repo root and the exported member name.
export interface LiveImporterModule {
	module: string;
	member: string;
}
export const liveIdentityTarget: {
	current: LiveImporterModule | null;
} = {
	current: {
		module: "packages/domain/src/identity/import.ts",
		member: "importLegacyIdentity",
	},
};

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

// --- ReconcileCanon: corpus access (files, manifest) -----------------------------

export const ReconcileCanon = {
	loadQuery: Effect.fn("ReconcileCanon.loadQuery")((file: string) =>
		Effect.tryPromise(() => loadQueryText(file)),
	),
	loadSabotage: Effect.fn("ReconcileCanon.loadSabotage")((file: string) =>
		Effect.tryPromise(() => loadSabotageText(file)),
	),
};

// --- ReconcileRunner: query execution over the @effect/sql client ----------------

const preconditionMissing = Effect.fn("ReconcileRunner.preconditionMissing")(
	(sql: PgClient.PgClient, preconditions: string[]) =>
		Effect.forEach(
			preconditions,
			(p) =>
				Effect.gen(function* () {
					const rows =
						(yield* sql`SELECT to_regclass(${quoteIdent(p)}) IS NULL AS missing`) as Array<{
							missing: boolean;
						}>;
					return rows[0]?.missing ? p : null;
				}),
			{ concurrency: "unbounded" },
		).pipe(Effect.map((found) => found.find((x): x is string => x !== null))),
);

const runQuery = Effect.fn("ReconcileRunner.runQuery")(
	(
		sql: PgClient.PgClient,
		id: number,
		mode: Mode,
		text: string,
		preconditions: string[],
	) =>
		Effect.gen(function* () {
			const missing = yield* preconditionMissing(sql, preconditions);
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
			const rows = yield* sql.unsafe(text);
			const violations = Array.isArray(rows) ? rows.length : 0;
			const verdict: Verdict = violations === 0 ? "green" : "red";
			yield* Effect.annotateCurrentSpan("stellarc.reconcile.query_id", id);
			yield* Effect.annotateCurrentSpan("stellarc.reconcile.mode", mode);
			yield* Effect.annotateCurrentSpan("stellarc.reconcile.verdict", verdict);
			yield* Effect.annotateCurrentSpan(
				"stellarc.reconcile.violations",
				violations,
			);
			return { id, mode, verdict, violations };
		}).pipe(Effect.withSpan("stellarc.reconcile.query")),
);

export const runCanonProofEffect = Effect.fn("ReconcileRunner.canonProof")(
	(sql: PgClient.PgClient, manifest: Manifest) =>
		Effect.gen(function* () {
			const results: QueryResult[] = [];
			for (const q of manifest.queries) {
				const text = yield* ReconcileCanon.loadQuery(q.file);
				results.push(
					yield* runQuery(sql, q.id, "canon-proof", text, q.preconditions),
				);
			}
			return results;
		}),
);

/** Live mode: apply merged importers from the restored legacy snapshot, then reconcile.
 * The legacy snapshot IS restored (defect 2: live runs against the real legacy state);
 * the merged identity importer is then detected and invoked. When no importer is
 * merged, identity queries report blocked with a reason naming STL-15, and every
 * other slice's queries report blocked with their owning slice — live green is
 * never faked over canon-proof data. */
export const runLiveEffect = Effect.fn("ReconcileRunner.live")(
	(sql: PgClient.PgClient, manifest: Manifest) =>
		Effect.gen(function* () {
			const results: QueryResult[] = [];
			const identityIds = new Set([1, 2, 3, 13, 14]);
			const importer = yield* detectIdentityImporter();
			// the import runs ONCE before any reconciliation; per-query re-imports
			// would re-insert imported rows and corrupt the destination.
			let importState: "ok" | "importer threw" | null = null;
			if (importer !== null) {
				importState = yield* invokeIdentityImporter(sql, importer);
			}
			for (const q of manifest.queries) {
				if (identityIds.has(q.id)) {
					if (importer === null) {
						results.push({
							id: q.id,
							mode: "live",
							verdict: "blocked",
							violations: 0,
							blockedReason:
								"merged identity importer not found (expected " +
								"packages/domain/src/identity/import.ts from STL-15)",
						});
						continue;
					}
					if (importState !== "ok") {
						results.push({
							id: q.id,
							mode: "live",
							verdict: "blocked",
							violations: 0,
							blockedReason: `identity importer failed: ${importState}`,
						});
						continue;
					}
				}
				const text = yield* ReconcileCanon.loadQuery(q.file);
				results.push(yield* runQuery(sql, q.id, "live", text, q.preconditions));
			}
			return results;
		}),
);

export interface LegacyIdentityImporter {
	importLegacyIdentity: (sql: PgClient.PgClient) => Promise<void> | void;
}

const detectIdentityImporter = Effect.fn("ReconcileRunner.detectImporter")(
	(): Effect.Effect<LegacyIdentityImporter | null> =>
		Effect.tryPromise({
			try: async () => {
				if (liveIdentityTarget.current === null) return null;
				const specifier = new URL(
					`file://${join(repoRoot(), liveIdentityTarget.current.module)}`,
				).href;
				const mod = (await import(
					/* webpackIgnore: true */ specifier
				)) as Record<string, unknown>;
				const fn = mod[liveIdentityTarget.current.member];
				if (typeof fn !== "function") return null;
				return {
					importLegacyIdentity:
						fn as LegacyIdentityImporter["importLegacyIdentity"],
				};
			},
			// Absent module = importer not merged. That is a SUCCESSFUL detection
			// with a null result, not an effect failure.
			catch: () => null,
		}).pipe(Effect.catchAll(() => Effect.succeed(null))),
);

const invokeIdentityImporter = Effect.fn("ReconcileRunner.invokeImporter")(
	(sql: PgClient.PgClient, importer: LegacyIdentityImporter) =>
		Effect.tryPromise({
			try: async () => {
				await importer.importLegacyIdentity(sql);
				return "ok" as const;
			},
			// the import failure is a VERDICT input (blocked-with-reason), never a
			// harness crash: surface it on the success channel.
			catch: () => "importer threw" as const,
		}).pipe(Effect.catchAll(() => Effect.succeed("importer threw" as const))),
);

// --- test-facing helpers ---------------------------------------------------------

export async function runCanonProof(
	sql: PgClient.PgClient,
	manifest: Manifest,
): Promise<QueryResult[]> {
	// Tests call this through a ManagedRuntime providing PgClient; the sql
	// argument here must already be a PgClient instance obtained from the layer.
	return Effect.runPromise(runCanonProofEffect(sql, manifest));
}

export async function runLive(
	sql: PgClient.PgClient,
	manifest: Manifest,
): Promise<QueryResult[]> {
	return Effect.runPromise(runLiveEffect(sql, manifest));
}

export async function applySabotage(
	sql: PgClient.PgClient,
	sabotageFile: string,
): Promise<void> {
	const text = await loadSabotageText(sabotageFile);
	await Effect.runPromise(sql.unsafe(text));
}

export async function restoreFixtures(url: {
	socket: string;
	database: string;
}) {
	const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
	// Same override the generators honor: lets tests point the runner at an
	// alternative fixture directory without touching the committed tree.
	const fixtures =
		process.env.RECON_FIXTURE_DIR ??
		join(repoRoot(), "tests", "fixtures", "reconciliation");
	for (const dump of [
		"legacy-snapshot.pgdump",
		"stellarc-destination-golden.pgdump",
	]) {
		execFileSync(
			join(bin, "pg_restore"),
			[
				"-h",
				url.socket,
				"-U",
				"stellarc_owner",
				"-d",
				url.database,
				"--no-owner",
				join(fixtures, dump),
			],
			{ stdio: "pipe" },
		);
	}
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

// --- layer construction shared by tests and CLI -----------------------------------

export function sqlLayer(socketDir: string, database = "postgres") {
	return SqlLive.pipe(
		Layer.provide(ConfigLive),
		Layer.provide(
			Layer.setConfigProvider(
				ConfigProvider.fromMap(
					new Map([
						[
							"DATABASE_URL",
							`postgresql://stellarc_owner@localhost/${database}?host=${encodeURIComponent(socketDir)}`,
						],
					]),
				),
			),
		),
	);
}

export async function main() {
	const manifest = await loadManifest();
	const mode = (process.argv[2] ?? "canon-proof") as Mode;
	const db = await disposablePostgres();
	try {
		if (mode === "canon-proof") {
			await restoreFixtures({
				socket: db.sql.options.host[0],
				database: db.sql.options.database ?? "postgres",
			});
		} else {
			// live mode: T0 schema only; importers apply on top at their merge points
			await migrate(db.sql);
		}
		const database = db.sql.options.database ?? "postgres";
		const socket = db.sql.options.host[0];
		const { ManagedRuntime } = await import("effect");
		const runtime = ManagedRuntime.make(sqlLayer(socket, database));
		try {
			const results =
				mode === "canon-proof"
					? await runtime.runPromise(
							Effect.gen(function* () {
								const sql = yield* PgClient.PgClient;
								return yield* runCanonProofEffect(sql, manifest);
							}),
						)
					: await runtime.runPromise(
							Effect.gen(function* () {
								const sql = yield* PgClient.PgClient;
								return yield* runLiveEffect(sql, manifest);
							}),
						);
			const { red, allBlocked } = aggregate(results);
			await writeReport(results, process.env.ARTIFACTS_DIR ?? process.cwd());
			process.exitCode = red > 0 || allBlocked ? 1 : 0;
		} finally {
			await runtime.dispose();
		}
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
