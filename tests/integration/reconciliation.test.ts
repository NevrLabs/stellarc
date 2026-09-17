import { join } from "node:path";
import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import {
	hashApiKey,
	loadManifest,
	loadQueryText,
	type Manifest,
} from "../../tools/reconciliation/canon";
import {
	aggregate,
	applySabotage,
	type QueryResult,
	restoreFixtures,
	runCanonProofEffect,
	runLiveEffect,
	sqlLayer,
} from "../../tools/reconciliation/run";
import { disposablePostgres } from "../helpers/postgres";

const manifest: Manifest = await loadManifest();

function repoRootFromModule(): string {
	return import.meta.dirname.replace(/\/tests\/integration$/, "");
}

function resultFor(results: QueryResult[], id: number): QueryResult {
	const found = results.find((r) => r.id === id);
	if (!found) throw new Error(`query ${id} missing from results`);
	return found;
}

let cluster: Awaited<ReturnType<typeof disposablePostgres>>;
type AnyContext = never; // R channel is satisfied by the scratch runtime layer

// ManagedRuntime bound to the sqlLayer context; two clusters share the shape.
type SqlRuntime = ReturnType<typeof makeRuntime>;
function makeRuntime(socketDir: string, database?: string) {
	return ManagedRuntime.make(
		database === undefined
			? sqlLayer(socketDir)
			: sqlLayer(socketDir, database),
	);
}
let runtime: SqlRuntime;
let pg: PgClient.PgClient;

beforeAll(async () => {
	cluster = await disposablePostgres();
	await restoreFixtures({
		socket: cluster.sql.options.host[0],
		database: cluster.sql.options.database ?? "postgres",
	});
	// Golden template: everything below restores into it, tests clone from it.
	templateDb = "recon_golden_template";
	await cluster.sql.unsafe(
		`CREATE DATABASE ${templateDb} TEMPLATE ${cluster.sql.options.database ?? "postgres"}`,
	);
	runtime = makeRuntime(
		cluster.sql.options.host[0],
		cluster.sql.options.database ?? "postgres",
	);
	pg = await runtime.runPromise(PgClient.PgClient);
});

afterAll(async () => {
	await runtime.dispose();
	await cluster.sql.unsafe(`DROP DATABASE IF EXISTS ${templateDb}`);
	await cluster.close();
});

// Mutating tests run against a per-test scratch database cloned from the golden
// template (created once in beforeAll). This replaces transaction rollback: the
// @effect/sql client routes statements through a pool, so a withTransaction
// FiberRef cannot reliably pin a test's statements to one connection. A scratch
// database gives true isolation regardless of pooling.
let templateDb: string;
let scratchCounter = 0;

async function withRollback<T>(
	fn: (
		tx: PgClient.PgClient,
		run: <A, E>(e: Effect.Effect<A, E, AnyContext>) => Promise<A>,
	) => Promise<T>,
): Promise<T> {
	scratchCounter += 1;
	const name = `recon_scratch_${scratchCounter}`;
	await cluster.sql.unsafe(`CREATE DATABASE ${name} TEMPLATE ${templateDb}`);
	const scratchRuntime = makeRuntime(cluster.sql.options.host[0], name);
	try {
		const pgScratch = await scratchRuntime.runPromise(PgClient.PgClient);
		const run = <A, E>(e: Effect.Effect<A, E, AnyContext>) =>
			scratchRuntime.runPromise(e);
		return await fn(pgScratch, run);
	} finally {
		await scratchRuntime.dispose();
		await cluster.sql.unsafe(`DROP DATABASE ${name}`);
	}
}

async function verdicts(sql: PgClient.PgClient) {
	return Effect.runPromise(runCanonProofEffect(sql, manifest));
}

describe("R02/R04 fixture restore and R05–R16 canon-proof green", () => {
	test("golden pair restores and every query is green with zero violation rows", async () => {
		// R02: legacy snapshot restored with the pinned fork table set
		const legacy = await runtime.runPromise(
			pg.unsafe(
				`SELECT to_regclass('legacy.user') IS NOT NULL AS u,
             to_regclass('legacy.apikey') IS NOT NULL AS k,
             to_regclass('legacy.task') IS NOT NULL AS t`,
			),
		);
		expect(legacy[0]).toEqual({ u: true, k: true, t: true });
		// R02: manifest-declared row counts present after restore (both sides)
		const mismatches: Array<Record<string, unknown>> = [];
		for (const [side, tables] of [
			["legacy", manifest.legacy_tables],
			["public", manifest.destination_tables],
		] as const) {
			for (const [table, expected] of Object.entries(tables)) {
				const [row] = (await runtime.runPromise(
					pg.unsafe(`SELECT count(*)::int AS actual FROM ${side}."${table}"`),
				)) as Array<{ actual: number }>;
				if (row.actual !== expected)
					mismatches.push({ side, table, expected, actual: row.actual });
			}
		}
		expect(mismatches, JSON.stringify(mismatches)).toEqual([]);
		// R04: destination golden restored; T0 foundation present
		const dest = await runtime.runPromise(
			pg.unsafe(
				`SELECT to_regclass('public.event') IS NOT NULL AS e,
             to_regclass('public.org_event_counter') IS NOT NULL AS c,
             to_regclass('public.identity_import') IS NOT NULL AS i`,
			),
		);
		expect(dest[0]).toEqual({ e: true, c: true, i: true });
		const results = await verdicts(pg);
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
				await withRollback(async (tx, _run) => {
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
		await withRollback(async (tx, _run) => {
			expect(resultFor(await verdicts(tx), 13).verdict).toBe("green");
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/13a.sql");
			const a = resultFor(await verdicts(tx), 13);
			expect(a.verdict).toBe("red");
			expect(a.violations).toBeGreaterThan(0);
		});
		await withRollback(async (tx, _run) => {
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/13b.sql");
			const b = resultFor(await verdicts(tx), 13);
			expect(b.verdict).toBe("red");
			expect(b.violations).toBeGreaterThan(0);
		});
	});
});

describe("R18/R20 query #14 apikey hash audit", () => {
	test("preserved-hash arm green; 14a corrupt-hash red; 14b reissue-without-event red", async () => {
		await withRollback(async (tx, _run) => {
			expect(resultFor(await verdicts(tx), 14).verdict).toBe("green");
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/14a.sql");
			const a = resultFor(await verdicts(tx), 14);
			expect(a.verdict).toBe("red");
			expect(a.violations).toBeGreaterThan(0);
		});
		await withRollback(async (tx, _run) => {
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
			await withRollback(async (tx, run) => {
				await run(tx.unsafe(mutation));
				const result = resultFor(await verdicts(tx), id);
				expect(result.verdict, mutation).toBe("red");
				expect(result.violations, mutation).toBeGreaterThan(0);
			});
		});
	}
});

describe("R20b #14 re-issue contract strictness (review D8)", () => {
	test("event with matching id but wrong reason or principalId does not satisfy the audit", async () => {
		await withRollback(async (tx, run) => {
			// flip k1 to re-issue state (hash differs) with a WRONG-reason event
			await run(
				tx`UPDATE public.apikey SET key = 'not-the-fork-hash-format-but-exactly-43-chars-long-x' WHERE id = 'k1'`,
			);
			await run(tx`INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid)
        VALUES ('o1', 2, 'identity:apikey-reissued', 'u1', ${{ id: "k1", principalId: "p2", reason: "wrong-reason" }}, 1, 1)`);
			const result = resultFor(await verdicts(tx), 14);
			expect(result.verdict).toBe("red");
		});
	});

	test("preserved hash AND a well-formed reissue event is a both-arms violation", async () => {
		await withRollback(async (tx, run) => {
			await run(tx`INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid)
        VALUES ('o1', 2, 'identity:apikey-reissued', 'u1', ${{ id: "k1", principalId: "p2", reason: "legacy-reissue" }}, 1, 1)`);
			const result = resultFor(await verdicts(tx), 14);
			expect(result.verdict).toBe("red");
			expect(result.violations).toBeGreaterThan(0);
		});
	});

	test("re-issued key WITH exactly one well-formed event is green", async () => {
		await withRollback(async (tx, run) => {
			await run(
				tx`UPDATE public.apikey SET key = 'not-the-fork-hash-format-but-exactly-43-chars-long-x' WHERE id = 'k1'`,
			);
			await run(tx`INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid)
        VALUES ('o1', 2, 'identity:apikey-reissued', 'u1', ${{ id: "k1", principalId: "p2", reason: "legacy-reissue" }}, 1, 1)`);
			const result = resultFor(await verdicts(tx), 14);
			expect(result.verdict).toBe("green");
		});
	});
});

describe("R03 fixture freshness and determinism", () => {
	// Scratch database used by the freshness test's regenerated-dump restore;
	// declared here so the finally-block can drop it even on failure.
	let scratchName: string | null = null;
	// Regenerate both dumps into a tmp dir via the committed generators, restore
	// them side by side with the committed fixtures, and compare every table as a
	// normalized multiset of rows. RED if a committed dump was mutated by hand or
	// if a generator is nondeterministic.
	async function logicalDump(
		sql: PgClient.PgClient,
		run: <A>(e: Effect.Effect<A, unknown, AnyContext>) => Promise<A>,
		side: "legacy" | "public",
		tables: readonly string[],
	): Promise<string> {
		const parts: string[] = [];
		for (const t of tables) {
			const cols = (await run(sql`
        SELECT string_agg(column_name, ',' ORDER BY column_name) AS cols
          FROM information_schema.columns
         WHERE table_schema = ${side} AND table_name = ${t}`)) as Array<{
				cols: string | null;
			}>;
			const rows = (await run(
				sql.unsafe(`SELECT * FROM ${side}."${t.replace(/"/g, '""')}"`),
			)) as Array<Record<string, unknown>>;
			const colList = (cols[0]?.cols ?? "").split(",").filter(Boolean);
			const normalized = rows
				.map((r) =>
					colList
						.map((c) => `${c}=${JSON.stringify(r[c]) ?? "null"}`)
						.sort()
						.join("|"),
				)
				.sort();
			parts.push(`-- ${side}.${t}\n${normalized.join("\n")}`);
		}
		return parts.join("\n");
	}

	test("regenerated dumps are logically equivalent to the committed fixtures", {
		timeout: 120_000,
	}, async () => {
		const { execFileSync } = await import("node:child_process");
		const { mkdtemp, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
		const gen = await mkdtemp(join(tmpdir(), "stl27-regen-"));
		// Run the generators with RECON_FIXTURE_DIR so they write to the tmp dir.
		// They default to the committed path; env override keeps the tree clean.
		const env = {
			...process.env,
			RECON_FIXTURE_DIR: gen,
			PATH: process.env.PATH ?? "",
		};
		const restore = (dump: string): void => {
			if (!scratchName) throw new Error("scratchName not initialised");
			restoreInto(scratchName, dump);
		};
		const restoreInto = (database: string, dump: string): void => {
			execFileSync(
				join(bin, "pg_restore"),
				[
					"-h",
					cluster.sql.options.host[0],
					"-U",
					"stellarc_owner",
					"-d",
					database,
					"--no-owner",
					dump,
				],
				{ stdio: "pipe" },
			);
		};
		try {
			execFileSync(
				process.execPath,
				["--bun", "tools/reconciliation/make-legacy-fixture.ts"],
				{ cwd: repoRootFromModule(), env, stdio: "pipe" },
			);
			execFileSync(
				process.execPath,
				["--bun", "tools/reconciliation/make-destination-golden.ts"],
				{ cwd: repoRootFromModule(), env, stdio: "pipe" },
			);
			// Restore the regenerated pair into a scratch database cloned from the
			// golden template's sibling (empty clone of postgres), not over the
			// committed fixtures. Destroys nothing.
			scratchName = `recon_regen_${Date.now()}`;
			await cluster.sql.unsafe(
				`CREATE DATABASE ${scratchName} TEMPLATE postgres`,
			);
			restore(join(gen, "legacy-snapshot.pgdump"));
			restore(join(gen, "stellarc-destination-golden.pgdump"));
			const scratchRuntime = makeRuntime(
				cluster.sql.options.host[0],
				scratchName,
			);
			try {
				const regenPg = await scratchRuntime.runPromise(PgClient.PgClient);
				for (const [side, tables] of [
					["legacy", Object.keys(manifest.legacy_tables)],
					["public", Object.keys(manifest.destination_tables)],
				] as const) {
					const a = await logicalDump(
						pg,
						(e) => runtime.runPromise(e),
						side,
						tables,
					);
					const b = await logicalDump(
						regenPg,
						(e) => scratchRuntime.runPromise(e),
						side,
						tables,
					);
					expect(b, `regenerated ${side} differs from committed`).toBe(a);
				}
			} finally {
				await scratchRuntime.dispose();
			}
		} finally {
			if (scratchName) {
				await cluster.sql.unsafe(`DROP DATABASE IF EXISTS ${scratchName}`);
				scratchName = null;
			}
			await rm(gen, { recursive: true, force: true });
		}
	});
	test("R03 negative control: a one-row mutation of the committed dump is detected", {
		timeout: 60_000,
	}, async () => {
		// Reproduce the defect-8 RED condition: a committed dump tampered with by a
		// hand edit must fail the freshness comparison. Clone the template (fast),
		// apply a one-row semantic mutation to the destination side, and assert the
		// comparison against the committed golden is unequal — proving the
		// logicalDump comparison can actually fail.
		const name = `recon_regen_${Date.now()}`;
		await cluster.sql.unsafe(`CREATE DATABASE ${name} TEMPLATE ${templateDb}`);
		const rt = makeRuntime(cluster.sql.options.host[0], name);
		try {
			const mut = await rt.runPromise(PgClient.PgClient);
			await mut.unsafe(
				`UPDATE public.board SET name = '__TAMPERED__' WHERE id = 'b1'`,
			);
			const a = await logicalDump(pg, (e) => runtime.runPromise(e), "public", [
				"board",
			]);
			const b = await logicalDump(mut, (e) => rt.runPromise(e), "public", [
				"board",
			]);
			expect(
				b,
				"tampered dump must NOT compare equal to the committed golden",
			).not.toBe(a);
		} finally {
			await rt.dispose();
			await cluster.sql.unsafe(`DROP DATABASE IF EXISTS ${name}`);
		}
	});
});

describe("R04 blocked semantics and R21 live mode", () => {
	test("hiding a ledger table flips its dependent query green -> blocked", async () => {
		await withRollback(async (tx, run) => {
			expect(resultFor(await verdicts(tx), 13).verdict).toBe("green");
			await run(tx.unsafe("DROP TABLE public.identity_import CASCADE"));
			const result = resultFor(await verdicts(tx), 13);
			expect(result.verdict).toBe("blocked");
		});
	});

	test("R02 negative control: a missing row in a restored table fails the count check", async () => {
		// The row-count assertion above must be able to fail: remove one row from a
		// restored legacy table and confirm the count mismatch is detectable.
		await withRollback(async (tx, run) => {
			const before = (await runtime.runPromise(
				tx`SELECT count(*)::int AS n FROM legacy.task`,
			)) as Array<{ n: number }>;
			await run(tx`DELETE FROM legacy.task WHERE id = 'task3'`);
			const mismatches = (await run(tx`
        SELECT (SELECT count(*) FROM legacy.task)::int AS actual,
               ${manifest.legacy_tables.task}::int AS expected`)) as Array<{
				actual: number;
				expected: number;
			}>;
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
			await withRollback(async (tx, run) => {
				await run(tx.unsafe(`DROP TABLE ${table} CASCADE`));
				const result = resultFor(await verdicts(tx), id);
				expect(result.verdict, `query ${id} under dropped ${table}`).toBe(
					"blocked",
				);
			});
		}
	});

	test("R21 live mode: fresh T0 destination (no merged importer) reports every query blocked via the live runner", async () => {
		const name = `recon_${crypto.randomUUID().replace(/-/g, "")}`;
		await cluster.sql.unsafe(`CREATE DATABASE ${name}`);
		const socket = cluster.sql.options.host[0];
		const liveRuntime = makeRuntime(socket, name);
		try {
			// apply T0 migrations to the fresh DB through a throwaway client
			const tmp = await import("postgres").then((m) =>
				m.default({
					host: socket,
					username: "stellarc_owner",
					database: name,
					max: 4,
					onnotice: () => {},
				}),
			);
			await migrate(tmp);
			await tmp.end();

			const results = await liveRuntime.runPromise(
				Effect.gen(function* () {
					const sql = yield* PgClient.PgClient;
					return yield* runLiveEffect(sql, manifest);
				}),
			);
			expect(results).toHaveLength(14);
			for (const r of results) {
				expect(r.mode, `query ${r.id}`).toBe("live");
				expect(r.verdict, `query ${r.id}`).toBe("blocked");
			}
			const { red, blocked, allBlocked } = aggregate(results);
			expect(red).toBe(0);
			expect(blocked).toBe(14);
			expect(allBlocked).toBe(true);
			// all-blocked is a harness failure, not success
			expect(red > 0 || allBlocked).toBe(true);
		} finally {
			await liveRuntime.dispose();
			await cluster.sql.unsafe(`DROP DATABASE IF EXISTS ${name}`);
		}
	});

	test("R21 live mode: restored golden pair driven through the live runner is green for merged-identity coverage", async () => {
		// At this merge point the identity importer is unmerged; the live runner
		// still must reconcile a correctly-imported destination when one exists.
		// The golden pair IS that destination, so the live arm over it must report
		// mode=live green for identity queries (1-3, 13, 14) and never blocked.
		const results = await runtime.runPromise(
			Effect.gen(function* () {
				const sql = yield* PgClient.PgClient;
				return yield* runLiveEffect(sql, manifest);
			}),
		);
		for (const id of [1, 2, 3, 13, 14]) {
			const r = resultFor(results, id);
			expect(r.mode).toBe("live");
			expect(r.verdict, `query ${id} in live mode`).toBe("green");
		}
	});

	test("R21 live mode negative control: 13b sabotage on the live destination turns #13 red", async () => {
		await withRollback(async (tx, run) => {
			await applySabotage(tx, "tests/fixtures/reconciliation/sabotage/13b.sql");
			const results = await run(runLiveEffect(tx, manifest));
			const r = resultFor(results, 13);
			expect(r.mode).toBe("live");
			expect(r.verdict).toBe("red");
		});
	});
});

describe("R22 spans", () => {
	test("stellarc.reconcile.query spans carry id/mode/verdict/violations; db.* spans exist; no SQL text or PII", async () => {
		const { TelemetryTest } = await import(
			"../../packages/telemetry/src/index"
		);
		const telemetry = TelemetryTest();
		// Build a runtime that layers telemetry UNDER the sql layer so db.* spans
		// propagate: telemetry provides the tracer; sql layer provides PgClient.
		const rt = ManagedRuntime.make(
			sqlLayer(
				cluster.sql.options.host[0],
				cluster.sql.options.database ?? "postgres",
			).pipe(Layer.provideMerge(telemetry.layer)),
		);
		try {
			await rt.runPromise(
				Effect.gen(function* () {
					const sql = yield* PgClient.PgClient;
					return yield* runCanonProofEffect(sql, manifest);
				}),
			);
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
			const dbSpans = telemetry.spans
				.getFinishedSpans()
				.filter((span) => span.name.startsWith("db."));
			expect(dbSpans.length).toBeGreaterThan(0);
			for (const span of dbSpans) {
				expect(span.attributes).not.toHaveProperty("db.query.text");
				expect(span.attributes).not.toHaveProperty("db.statement");
			}
		} finally {
			await rt.dispose();
		}
	});
});

// R22 negative control: the span assertions above must be attributable to the
// runner's instrumentation, not to the query machinery. Running the runner's
// file-to-execute flow with every Effect.fn wrapper / withSpan annotation
// removed must turn the R22 span-count assertion red — and red because no
// stellarc.reconcile.query span exists at all, not merely fewer.
describe("R22 negative control", () => {
	test("with instrumentation stripped the R22 span-count assertion goes red", async () => {
		const { TelemetryTest } = await import(
			"../../packages/telemetry/src/index"
		);
		const telemetry = TelemetryTest();
		const rt = ManagedRuntime.make(
			sqlLayer(
				cluster.sql.options.host[0],
				cluster.sql.options.database ?? "postgres",
			).pipe(Layer.provideMerge(telemetry.layer)),
		);
		try {
			const results = await rt.runPromise(
				Effect.gen(function* () {
					const sql = yield* PgClient.PgClient;
					const out: Array<{ id: number; violations: number }> = [];
					for (const q of manifest.queries) {
						const text = yield* Effect.tryPromise(() => loadQueryText(q.file));
						const rows = yield* sql.unsafe(text);
						out.push({
							id: q.id,
							violations: Array.isArray(rows) ? rows.length : 0,
						});
					}
					return out;
				}),
			);
			// The queries themselves still run and stay green: stripping
			// instrumentation changes nothing about detection.
			expect(results).toHaveLength(14);
			for (const r of results) expect(r.violations).toBe(0);
			// The R22 span-count assertion, applied verbatim to the stripped
			// pipeline, must fail — this is R22's RED condition reproduced.
			const spans = telemetry.spans
				.getFinishedSpans()
				.filter((span) => span.name === "stellarc.reconcile.query");
			const assertR22SpanCount = () => expect(spans).toHaveLength(14);
			expect(assertR22SpanCount).toThrowError();
			// ...and it fails for the right reason: zero reconcile spans.
			expect(spans).toHaveLength(0);
		} finally {
			await rt.dispose();
		}
	});
});
