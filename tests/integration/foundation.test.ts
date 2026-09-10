import { createCollection } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { afterEach, beforeEach, expect, test } from "vitest";
import { startTestServer } from "./test-server";

const resources: Array<() => Promise<void>> = [];

beforeEach(() => {
	// A previous test must not leave clients polling or PostgreSQL clusters alive.
	expect(resources).toHaveLength(0);
});

test("T01 HTTP shape spans remain inside the inbound request trace", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	await migrate(db.sql);
	const web = foundationHandler(
		db.sql,
		new ShapeEngine(db.sql),
		() => "ok",
		undefined,
		telemetry.layer,
	);
	try {
		const response = await web.handler(
			new Request(
				"http://test/orgs/trace/v1/shape?table=sync_probe&offset=-1",
				{
					headers: {
						traceparent:
							"00-11111111111111111111111111111111-2222222222222222-01",
					},
				},
			),
		);
		expect(response.status).toBe(200);
		await response.text();
		const snapshots = telemetry.spans
			.getFinishedSpans()
			.filter((span) => span.name === "stellarc.shape.snapshot");
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0].spanContext().traceId).toBe(
			"11111111111111111111111111111111",
		);
	} finally {
		await web.dispose();
		await db.close();
	}
});

test("T13 denied shape responses use the shared sanitized error contract", async () => {
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const postgres = (await import("postgres")).default;
	const sql = postgres("postgres://localhost:1/unused", { connect_timeout: 1 });
	try {
		for (const decision of ["unauthenticated", "forbidden"] as const) {
			const web = foundationHandler(sql, new ShapeEngine(sql), () => decision);
			try {
				const response = await web.handler(
					new Request(
						"http://test/orgs/private/v1/shape?table=sync_probe&offset=-1",
					),
				);
				expect(response.status).toBe(
					decision === "unauthenticated" ? 401 : 403,
				);
				expect(response.headers.get("content-type")).toContain(
					"application/json",
				);
				expect(await response.json()).toEqual(
					decision === "unauthenticated"
						? { _tag: "Unauthenticated", message: "Authentication required" }
						: { _tag: "Forbidden", message: "Access denied" },
				);
				expect(response.headers.has("electric-handle")).toBe(false);
			} finally {
				await web.dispose();
			}
		}
	} finally {
		await sql.end();
	}
});

test("T11 HTTP disconnect interrupts live polling without further SQL queries", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const db = await disposablePostgres();
	await migrate(db.sql);
	const telemetry = TelemetryTest();
	const web = foundationHandler(
		db.sql,
		new ShapeEngine(db.sql),
		() => "ok",
		undefined,
		telemetry.layer,
	);
	try {
		const initial = await web.handler(
			new Request(
				"http://test/orgs/cancel/v1/shape?table=sync_probe&offset=-1",
			),
		);
		await initial.text();
		const url = new URL(
			"http://test/orgs/cancel/v1/shape?table=sync_probe&live=true",
		);
		url.searchParams.set(
			"handle",
			initial.headers.get("electric-handle") ?? "",
		);
		url.searchParams.set(
			"offset",
			initial.headers.get("electric-offset") ?? "",
		);
		const controller = new AbortController();
		const tails = () =>
			telemetry.spans
				.getFinishedSpans()
				.filter((span) => span.name === "stellarc.shape.tail").length;
		const poll = web
			.handler(new Request(url, { signal: controller.signal }))
			.catch(() => undefined);
		await expect.poll(tails).toBeGreaterThan(0);
		controller.abort();
		await poll;
		// Allow an already-dispatched query to finish; no later poll may begin.
		await new Promise((resolve) => setTimeout(resolve, 250));
		const stoppedAt = tails();
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(tails()).toBe(stoppedAt);
		const [activity] =
			await db.sql`SELECT count(*)::int AS active FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname=current_database() AND state='active'`;
		expect(activity.active).toBe(0);
	} finally {
		await web.dispose();
		await db.close();
	}
});

test("T11 live connection gauge returns to zero and wait histogram records abort", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { Effect, ManagedRuntime } = await import("effect");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	const controller = new AbortController();
	try {
		await migrate(db.sql);
		const engine = new ShapeEngine(db.sql);
		const url = new URL("http://test/?table=sync_probe&offset=-1");
		const initial = await runtime.runPromise(
			engine.shapeEffect("metrics", url),
		);
		url.searchParams.set(
			"handle",
			initial.headers.get("electric-handle") ?? "",
		);
		url.searchParams.set(
			"offset",
			initial.headers.get("electric-offset") ?? "",
		);
		url.searchParams.set("live", "true");
		const pending = runtime.runPromise(
			engine.shapeEffect("metrics", url, controller.signal).pipe(Effect.either),
		);
		await expect
			.poll(
				() =>
					telemetry.spans
						.getFinishedSpans()
						.filter((span) => span.name === "stellarc.shape.tail").length,
			)
			.toBeGreaterThan(0);
		const metrics = () =>
			telemetry.metrics
				.getMetrics()
				.slice()
				.reverse()
				.flatMap((resource) =>
					resource.scopeMetrics.flatMap((scope) => scope.metrics),
				);
		await telemetry.reader.forceFlush();
		expect(
			metrics()
				.find(
					(metric) =>
						metric.descriptor.name === "stellarc_shape_live_connections",
				)
				?.dataPoints.map((point) => point.value),
		).toContain(1);
		controller.abort();
		await pending;
		await telemetry.reader.forceFlush();
		expect(
			metrics()
				.find(
					(metric) =>
						metric.descriptor.name === "stellarc_shape_live_connections",
				)
				?.dataPoints.map((point) => point.value),
		).toContain(0);
		expect(
			metrics().some(
				(metric) =>
					metric.descriptor.name === "stellarc_shape_tail_wait_seconds" &&
					metric.dataPoints.length > 0,
			),
		).toBe(true);
	} finally {
		controller.abort();
		await runtime.dispose();
		await db.close();
	}
});

test("SqlLive exports query metadata without SQL text or parameter values", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { SqlLive } = await import("../../packages/db/src/index");
	const { ConfigLive } = await import("../../apps/stellarc-api/src/config");
	const { PgClient } = await import("@effect/sql-pg");
	const { ConfigProvider, Effect, ManagedRuntime } = await import("effect");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		await migrate(db.sql);
		const rows = await runtime.runPromise(
			Effect.gen(function* () {
				const sql = yield* PgClient.PgClient;
				return yield* sql`SELECT org FROM sync_probe WHERE value=${"private-parameter"} AND id='private-literal'`;
			}).pipe(
				Effect.provide(SqlLive),
				Effect.provide(ConfigLive),
				Effect.withConfigProvider(
					ConfigProvider.fromMap(
						new Map([
							[
								"DATABASE_URL",
								`postgresql://stellarc_owner@localhost/postgres?host=${encodeURIComponent(db.sql.options.host[0])}`,
							],
						]),
					),
				),
			),
		);
		expect(rows).toEqual([]);
		const spans = telemetry.spans.getFinishedSpans();
		const queries = spans.filter((span) => span.name.startsWith("db."));
		expect(queries).toHaveLength(1);
		expect(queries[0].attributes).toMatchObject({
			"db.system": "postgresql",
			"db.operation": "SELECT",
			"db.sql.table": "sync_probe",
		});
		for (const span of spans) {
			expect(span.attributes).not.toHaveProperty("db.query.text");
			expect(span.attributes).not.toHaveProperty("db.statement");
			expect(JSON.stringify(span.attributes)).not.toMatch(
				/private-parameter|private-literal|SELECT org/,
			);
		}
	} finally {
		await runtime.dispose();
		await db.close();
	}
});

test("T06 migration exports its applied version through the caller trace", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { applyMigration } = await import("../../packages/db/src/migrate");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { Effect, ManagedRuntime } = await import("effect");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		await runtime.runPromise(
			Effect.gen(function* () {
				yield* applyMigration(db.sql);
			}).pipe(Effect.withSpan("migration.caller")),
		);
		const spans = telemetry.spans.getFinishedSpans();
		const applied = spans.filter(
			(span) => span.name === "stellarc.migrate.apply",
		);
		expect(applied).toHaveLength(1);
		expect(applied[0].attributes["stellarc.migration.version"]).toBe(
			"0001_foundation",
		);
		expect(applied[0].spanContext().traceId).toBe(
			spans.find((span) => span.name === "migration.caller")?.spanContext()
				.traceId,
		);
	} finally {
		await runtime.dispose();
		await db.close();
	}
});

test("T05 append spans share the mutation trace and report committed event identities", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbesEffect } = await import(
		"../../packages/domain/src/index"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { Effect, ManagedRuntime } = await import("effect");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		await migrate(db.sql);
		const result = await runtime.runPromise(
			mutateProbesEffect(db.sql, "trace-org", "actor", [
				{ operation: "upsert", id: "one", value: "secret-value" },
				{ operation: "upsert", id: "two", value: "secret-value" },
			]).pipe(Effect.withSpan("mutation.caller")),
		);
		const spans = telemetry.spans.getFinishedSpans();
		const events = spans.filter(
			(span) => span.name === "stellarc.event.append",
		);
		expect(events).toHaveLength(2);
		expect(events.map((span) => span.attributes["stellarc.event.seq"])).toEqual(
			["1", "2"],
		);
		for (const span of events) {
			expect(span.attributes["stellarc.event.txid"]).toBe(result.txid);
			expect(span.attributes["stellarc.event.type"]).toBe(
				"foundation:probe-upserted",
			);
			expect(span.spanContext().traceId).toBe(
				spans.find((entry) => entry.name === "mutation.caller")?.spanContext()
					.traceId,
			);
			expect(JSON.stringify(span.attributes)).not.toContain("secret-value");
		}
		await telemetry.reader.forceFlush();
		const metrics = telemetry.metrics
			.getMetrics()
			.flatMap((item) => item.scopeMetrics.flatMap((scope) => scope.metrics));
		expect(
			metrics
				.find(
					(metric) =>
						metric.descriptor.name === "stellarc_events_appended_total",
				)
				?.dataPoints.map((point) => point.value),
		).toContain(2);
	} finally {
		await runtime.dispose();
		await db.close();
	}
});

test("T01 shape spans preserve snapshot and contiguous tail boundaries", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { writeProbe } = await import("../../packages/domain/src/index");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { Effect, ManagedRuntime } = await import("effect");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		await migrate(db.sql);
		const engine = new ShapeEngine(db.sql);
		const url = new URL(
			"http://test/orgs/trace/v1/shape?table=sync_probe&offset=-1",
		);
		await runtime.runPromise(
			Effect.gen(function* () {
				let response = yield* engine.shapeEffect("trace", url);
				url.searchParams.set(
					"handle",
					response.headers.get("electric-handle")!,
				);
				for (const id of ["one", "two"]) {
					url.searchParams.set(
						"offset",
						response.headers.get("electric-offset")!,
					);
					yield* Effect.promise(() =>
						writeProbe(db.sql, "trace", "actor", id, id),
					);
					response = yield* engine.shapeEffect("trace", url);
				}
			}).pipe(Effect.withSpan("reconnect.caller")),
		);
		const spans = telemetry.spans.getFinishedSpans();
		expect(
			spans.filter((span) => span.name === "stellarc.shape.snapshot"),
		).toHaveLength(1);
		const tails = spans.filter((span) => span.name === "stellarc.shape.tail");
		expect(
			tails.map((span) => span.attributes["stellarc.shape.offset_from"]),
		).toEqual(["0", "1"]);
		expect(
			tails.map((span) => span.attributes["stellarc.shape.events_sent"]),
		).toEqual([1, 1]);
		for (const span of tails)
			expect(span.spanContext().traceId).toBe(
				spans.find((entry) => entry.name === "reconnect.caller")?.spanContext()
					.traceId,
			);
	} finally {
		await runtime.dispose();
		await db.close();
	}
});

test("T09 real fixture HttpApi commits mutations and stock awaitTxId settles", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	const collection = createCollection(
		electricCollectionOptions<{
			org: string;
			id: string;
			value: string;
			last_seq: string;
		}>({
			id: "http-probes",
			getKey: (row) => JSON.stringify([row.org, row.id]),
			shapeOptions: {
				url: `${server.url}/orgs/http/v1/shape`,
				params: { table: "sync_probe" },
				headers: { authorization: "Bearer http" },
			},
		}),
	);
	resources.push(async () => {
		await collection.cleanup();
	});
	await collection.preload();
	const response = await fetch(`${server.url}/orgs/http/__test/probes`, {
		method: "POST",
		headers: {
			authorization: "Bearer http",
			"content-type": "application/json",
		},
		body: JSON.stringify({ id: "one", value: "committed" }),
	});
	expect(response.status).toBe(200);
	const { txid } = await response.json();
	expect(Number.isSafeInteger(txid)).toBe(true);
	expect(txid).not.toBe(1);
	await collection.utils.awaitTxId(txid, 5000);
	expect(collection.get(JSON.stringify(["http", "one"]))?.value).toBe(
		"committed",
	);
	expect(await server.eventCount("http")).toBe(1);
	const removed = await fetch(`${server.url}/orgs/http/__test/probes/one`, {
		method: "DELETE",
		headers: { authorization: "Bearer http" },
	});
	expect(removed.status).toBe(200);
	await collection.utils.awaitTxId((await removed.json()).txid, 5000);
	expect(collection.size).toBe(0);
	const missing = await fetch(`${server.url}/orgs/http/__test/probes/one`, {
		method: "DELETE",
		headers: { authorization: "Bearer http" },
	});
	expect(missing.status).toBe(404);
	expect(await server.eventCount("http")).toBe(2);
});

test("T18 fixture mutations reject unauthorized and invalid bodies without writes", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	for (const [headers, body, status] of [
		[{}, { id: "one", value: "x" }, 401],
		[{ authorization: "Bearer wrong" }, { id: "one", value: "x" }, 403],
		[{ authorization: "Bearer fixture" }, { id: "", value: "x" }, 400],
		[
			{ authorization: "Bearer fixture" },
			{ id: "x".repeat(129), value: "x" },
			400,
		],
		[{ authorization: "Bearer fixture" }, { id: "one", value: 12 }, 400],
	] as const) {
		const response = await fetch(`${server.url}/orgs/fixture/__test/probes`, {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		expect(response.status).toBe(status);
		expect(await response.json()).toHaveProperty("_tag");
	}
	expect(await server.eventCount("fixture")).toBe(0);
});

test("T17 worker emits start/stop lifecycle spans and releases SQL on interruption", async () => {
	const { ConfigProvider, Effect, Fiber, ManagedRuntime } = await import(
		"effect"
	);
	const { worker } = await import("../../apps/stellarc-worker/src/main");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { disposablePostgres } = await import("../helpers/postgres");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	const databaseUrl = `postgresql://stellarc_owner@localhost/postgres?host=${encodeURIComponent(db.sql.options.host[0])}`;
	const fiber = runtime.runFork(
		worker.pipe(
			Effect.withConfigProvider(
				ConfigProvider.fromMap(new Map([["DATABASE_URL", databaseUrl]])),
			),
		),
	);
	try {
		await expect
			.poll(() => telemetry.spans.getFinishedSpans().map((span) => span.name))
			.toContain("stellarc.worker.start");
		expect(
			telemetry.spans.getFinishedSpans().map((span) => span.name),
		).not.toContain("stellarc.worker.stop");
		await Effect.runPromise(Fiber.interrupt(fiber));
		const lifecycle = telemetry.spans
			.getFinishedSpans()
			.filter((span) => span.name.startsWith("stellarc.worker."));
		expect(lifecycle.map((span) => span.name)).toEqual([
			"stellarc.worker.start",
			"stellarc.worker.stop",
		]);
		const [row] =
			await db.sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='stellarc'`;
		expect(row.count).toBe(0);
	} finally {
		await Effect.runPromise(Fiber.interrupt(fiber));
		await runtime.dispose();
		await db.close();
	}
});

test("T17 worker starts with SQL, releases and exits on SIGTERM; invalid config exits nonzero", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const db = await disposablePostgres();
	resources.push(db.close);
	const env = {
		...process.env,
		DATABASE_URL: `postgresql://stellarc_owner@localhost/postgres?host=${encodeURIComponent(db.sql.options.host[0])}`,
	};
	const child = Bun.spawn(
		[process.execPath, "apps/stellarc-worker/src/main.ts"],
		{ env, stdout: "pipe", stderr: "pipe" },
	);
	try {
		const reader = child.stdout.getReader();
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toContain("worker ready");
		reader.releaseLock();
		child.kill("SIGTERM");
		expect(await child.exited).toBe(0);
		await expect
			.poll(async () => {
				const [row] =
					await db.sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='stellarc'`;
				return row.count;
			})
			.toBe(0);
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
	}
	const invalid = Bun.spawn(
		[process.execPath, "apps/stellarc-worker/src/main.ts"],
		{ env: { ...env, DATABASE_URL: "" }, stdout: "pipe", stderr: "pipe" },
	);
	expect(await invalid.exited).not.toBe(0);
	expect(await new Response(invalid.stderr).text()).not.toContain(
		"postgresql://",
	);
});

test("T18 production API is fail-closed and never mounts fixture routes", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const db = await disposablePostgres();
	resources.push(db.close);
	const portProbe = Bun.serve({ port: 0, fetch: () => new Response() });
	const port = portProbe.port;
	portProbe.stop(true);
	const child = Bun.spawn([process.execPath, "apps/stellarc-api/src/main.ts"], {
		env: {
			...process.env,
			PORT: String(port),
			DATABASE_URL: `postgresql://stellarc_owner@localhost/postgres?host=${encodeURIComponent(db.sql.options.host[0])}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${port}/health`)).status;
					} catch {
						return 0;
					}
				},
				{ timeout: 10000 },
			)
			.toBe(200);
		for (const method of ["POST", "DELETE"]) {
			const response = await fetch(
				`http://localhost:${port}/orgs/prod/__test/probes${method === "DELETE" ? "/one" : ""}`,
				{ method, headers: { authorization: "Bearer prod" } },
			);
			expect(response.status).toBe(404);
		}
		for (const [headers, status] of [
			[{}, 401],
			[{ authorization: "Bearer prod" }, 403],
		] as const) {
			const response = await fetch(
				`http://localhost:${port}/orgs/prod/v1/shape?table=sync_probe&offset=-1`,
				{ headers },
			);
			expect(response.status).toBe(status);
		}
		child.kill("SIGTERM");
		expect(await child.exited).toBe(0);
	} finally {
		if (child.exitCode === null) {
			child.kill("SIGKILL");
			await child.exited;
		}
	}
});

test("T17 SqlLive owns and closes its PostgreSQL pool", async () => {
	const { Effect, Exit, Layer, Redacted, Scope } = await import("effect");
	const { PgClient } = await import("@effect/sql-pg");
	const { SqlLive } = await import("../../packages/db/src/index");
	const { AppConfig } = await import("../../apps/stellarc-api/src/config");
	const { disposablePostgres } = await import("../helpers/postgres");
	const db = await disposablePostgres();
	resources.push(db.close);
	const scope = await Effect.runPromise(Scope.make());
	const config = Layer.succeed(AppConfig, {
		databaseUrl: Redacted.make(
			`postgresql://stellarc_owner@localhost/postgres?host=${encodeURIComponent(db.sql.options.host[0])}`,
		),
		port: 3000,
	});
	const context = await Effect.runPromise(
		Layer.buildWithScope(SqlLive.pipe(Layer.provide(config)), scope),
	);
	const sql = await Effect.runPromise(
		PgClient.PgClient.pipe(Effect.provide(context)),
	);
	expect(await Effect.runPromise(sql`SELECT 1 AS value`)).toEqual([
		{ value: 1 },
	]);
	await Effect.runPromise(Scope.close(scope, Exit.void));
	await expect(Effect.runPromise(sql`SELECT 1`)).rejects.toThrow();
});

test("T02 same-org update/delete writers commit in reservation order without inverted locks", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { writeProbe, deleteProbe } = await import(
		"../../packages/domain/src/index"
	);
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await writeProbe(db.sql, "ordered", "actor", "same", "initial");
	await db.sql.unsafe(
		`CREATE FUNCTION pause_writer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'value' = 'paused' THEN PERFORM pg_advisory_xact_lock(1402); END IF; RETURN NEW; END $$; CREATE TRIGGER pause_writer BEFORE INSERT ON event FOR EACH ROW EXECUTE FUNCTION pause_writer()`,
	);
	const barrier = await db.sql.reserve();
	await barrier`SELECT pg_advisory_lock(1402)`;
	const commits: string[] = [];
	const a = writeProbe(db.sql, "ordered", "actor", "same", "paused").then(
		(result) => {
			commits.push("a");
			return result;
		},
	);
	let settled: Promise<PromiseSettledResult<{ txid: number }>[]> | undefined;
	try {
		await expect
			.poll(
				async () => {
					const [row] =
						await db.sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE 'INSERT INTO event%'`;
					return row.count;
				},
				{ timeout: 5000 },
			)
			.toBe(1);
		const b = deleteProbe(db.sql, "ordered", "actor", "same").then((result) => {
			commits.push("b");
			return result;
		});
		settled = Promise.allSettled([a, b]);
		await expect
			.poll(
				async () => {
					const [row] =
						await db.sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND (query LIKE 'UPDATE org_event_counter%' OR query LIKE 'INSERT INTO org_event_counter%')`;
					return row.count;
				},
				{ timeout: 5000 },
			)
			.toBe(1);
	} finally {
		await barrier`SELECT pg_advisory_unlock(1402)`;
		barrier.release();
	}
	const results = await (settled ?? Promise.allSettled([a]));
	expect(results.map((result) => result.status)).toEqual([
		"fulfilled",
		"fulfilled",
	]);
	expect(commits).toEqual(["a", "b"]);
	expect(
		await db.sql`SELECT seq::text,plugin_type FROM event WHERE org='ordered' ORDER BY seq`,
	).toEqual([
		{ seq: "1", plugin_type: "foundation:probe-upserted" },
		{ seq: "2", plugin_type: "foundation:probe-upserted" },
		{ seq: "3", plugin_type: "foundation:probe-deleted" },
	]);
	expect(
		await db.sql`SELECT id FROM sync_probe WHERE org='ordered'`,
	).toHaveLength(0);
});

test("T03 different-org writers proceed while another org holds its reservation", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { writeProbe } = await import("../../packages/domain/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await db.sql.unsafe(
		`CREATE FUNCTION pause_org() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.org = 'held' THEN PERFORM pg_advisory_xact_lock(1403); END IF; RETURN NEW; END $$; CREATE TRIGGER pause_org BEFORE INSERT ON event FOR EACH ROW EXECUTE FUNCTION pause_org()`,
	);
	const barrier = await db.sql.reserve();
	await barrier`SELECT pg_advisory_lock(1403)`;
	const a = writeProbe(db.sql, "held", "actor", "same", "a");
	let b: Promise<{ txid: number }> | undefined;
	try {
		await expect
			.poll(
				async () => {
					const [row] =
						await db.sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE 'INSERT INTO event%'`;
					return row.count;
				},
				{ timeout: 5000 },
			)
			.toBe(1);
		let committed = false;
		b = writeProbe(db.sql, "free", "actor", "same", "b").then((result) => {
			committed = true;
			return result;
		});
		await expect.poll(() => committed, { timeout: 3000 }).toBe(true);
		expect(await db.sql`SELECT org,seq::text FROM event`).toEqual([
			{ org: "free", seq: "1" },
		]);
	} finally {
		await barrier`SELECT pg_advisory_unlock(1403)`;
		barrier.release();
		await Promise.allSettled([a, ...(b ? [b] : [])]);
	}
});

test("T06 runtime role can append through the domain but cannot mutate event history", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate, grantRuntime } = await import(
		"../../packages/db/src/migrate"
	);
	const { writeProbe } = await import("../../packages/domain/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await db.sql`CREATE ROLE stellarc_runtime LOGIN`;
	await expect(grantRuntime(db.sql, "stellarc_owner")).rejects.toThrow(
		"Runtime role must be unprivileged",
	);
	await expect(grantRuntime(db.sql, "bad;role")).rejects.toThrow(
		"Invalid runtime role",
	);
	await grantRuntime(db.sql, "stellarc_runtime");
	const postgres = (await import("postgres")).default;
	const runtime = postgres({
		host: db.sql.options.host[0],
		username: "stellarc_runtime",
		database: "postgres",
		max: 2,
	});
	try {
		await writeProbe(runtime, "grants", "actor", "probe", "allowed");
		for (const command of [
			"UPDATE event SET actor='forged'",
			"DELETE FROM event",
			"TRUNCATE event",
			"ALTER TABLE event ADD COLUMN bad text",
			"UPDATE stellarc_migration SET checksum='forged'",
		]) {
			await expect(runtime.unsafe(command)).rejects.toMatchObject({
				code: "42501",
			});
		}
		// Re-provisioning revokes an accidentally granted direct history permission.
		await db.sql`GRANT UPDATE, DELETE ON event TO stellarc_runtime`;
		await grantRuntime(db.sql, "stellarc_runtime");
		await expect(
			runtime`UPDATE event SET actor='forged'`,
		).rejects.toMatchObject({ code: "42501" });
		expect(await runtime`SELECT actor FROM event WHERE org='grants'`).toEqual([
			{ actor: "actor" },
		]);
	} finally {
		await runtime.end();
	}
});

test("T16 health reports database outages without leaking driver details", async () => {
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { disposablePostgres } = await import("../helpers/postgres");
	const db = await disposablePostgres();
	const http = foundationHandler(
		db.sql,
		new ShapeEngine(db.sql),
		() => "forbidden",
	);
	try {
		const healthy = await http.handler(new Request("http://test/health"));
		expect(healthy.status).toBe(200);
		expect(await healthy.json()).toEqual({ status: "ok" });
		await db.close();
		const failed = await http.handler(new Request("http://test/health"));
		expect(failed.status).toBe(503);
		expect(await failed.json()).toEqual({
			_tag: "Unavailable",
			message: "Service unavailable",
		});
	} finally {
		await http.dispose();
	}
});

test("T16 shape failures sanitize unexpected defects and database outages", async () => {
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	await migrate(db.sql);
	const engine = new ShapeEngine(db.sql);
	engine.afterProjectionRead = async () => {
		throw new Error("private connection stack credential");
	};
	const http = foundationHandler(db.sql, engine, () => "ok");
	try {
		const response = await http.handler(
			new Request("http://test/orgs/a/v1/shape?table=sync_probe&offset=-1"),
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			_tag: "InternalError",
			message: "Internal server error",
		});
		await db.close();
		const outage = await http.handler(
			new Request("http://test/orgs/a/v1/shape?table=sync_probe&offset=-1"),
		);
		expect(outage.status).toBe(503);
		expect(await outage.json()).toEqual({
			_tag: "Unavailable",
			message: "Service unavailable",
		});
	} finally {
		await http.dispose();
	}
});

test("T11 live tail waits, wakes on a committed row without notification and cancels resources", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { writeProbe } = await import("../../packages/domain/src/index");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const engine = new ShapeEngine(db.sql);
	const initial = await engine.shape(
		"poll",
		new URL("http://test/?table=sync_probe&offset=-1"),
	);
	const url = new URL(
		`http://test/?table=sync_probe&live=true&offset=${initial.headers.get("electric-offset")}&handle=${initial.headers.get("electric-handle")}`,
	);
	const controller = new AbortController();
	const pending = engine.shape("poll", url, controller.signal);
	const began = performance.now();
	await new Promise((resolve) => setTimeout(resolve, 100));
	const result = await writeProbe(db.sql, "poll", "actor", "one", "committed");
	const response = await pending;
	expect(performance.now() - began).toBeGreaterThanOrEqual(100);
	expect(response.status).toBe(200);
	expect(response.headers.get("electric-cursor")).toBeTruthy();
	const messages = await response.json();
	expect(messages[0].headers.txids).toEqual([result.txid]);
	url.searchParams.set("offset", response.headers.get("electric-offset") ?? "");
	const abort = new AbortController();
	const canceled = engine.shape("poll", url, abort.signal);
	abort.abort();
	await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
});

test("T11 Bun long poll times out at 20 seconds with no body and retained cursor", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	const headers = { authorization: "Bearer org-a" };
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const initial = await fetch(`${base}&offset=-1`, { headers });
	const offset = initial.headers.get("electric-offset");
	const handle = initial.headers.get("electric-handle");
	const began = performance.now();
	const response = await fetch(
		`${base}&offset=${offset}&handle=${handle}&live=true`,
		{ headers },
	);
	expect(response.status).toBe(204);
	expect(performance.now() - began).toBeGreaterThanOrEqual(19500);
	expect(performance.now() - began).toBeLessThan(25000);
	expect(await response.text()).toBe("");
	expect(response.headers.get("electric-offset")).toBe(offset);
	expect(response.headers.get("electric-handle")).toBe(handle);
	expect(response.headers.get("electric-cursor")).toBeTruthy();
});

test("T13 revoked authorization is checked again after live wake without leaking a handle", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { writeProbe } = await import("../../packages/domain/src/index");
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	let allowed = true;
	let calls = 0;
	const http = foundationHandler(db.sql, new ShapeEngine(db.sql), () => {
		calls++;
		return allowed ? "ok" : "forbidden";
	});
	resources.push(http.dispose);
	const initial = await http.handler(
		new Request("http://test/orgs/a/v1/shape?table=sync_probe&offset=-1"),
	);
	const before = calls;
	const poll = http.handler(
		new Request(
			`http://test/orgs/a/v1/shape?table=sync_probe&live=true&offset=${initial.headers.get("electric-offset")}&handle=${initial.headers.get("electric-handle")}`,
		),
	);
	await expect.poll(() => calls).toBeGreaterThan(before);
	allowed = false;
	await writeProbe(db.sql, "a", "actor", "secret", "private");
	const response = await poll;
	expect(response.status).toBe(403);
	expect(response.headers.has("electric-handle")).toBe(false);
	expect(await response.json()).toEqual({
		_tag: "Forbidden",
		message: "Access denied",
	});
});

test("T15 unsupported probe versions fail closed before any tail payload escapes", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const engine = new ShapeEngine(db.sql);
	const initial = await engine.shape(
		"versions",
		new URL("http://test/?table=sync_probe&offset=-1"),
	);
	await db.sql`INSERT INTO org_event_counter(org,seq) VALUES ('versions',1)`;
	await db.sql`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid) VALUES ('versions',1,'foundation:probe-upserted','actor','{"id":"probe","value":"must-not-escape"}',2,pg_current_xact_id()::text::bigint)`;
	const response = await engine.shape(
		"versions",
		new URL(
			`http://test/?table=sync_probe&offset=${initial.headers.get("electric-offset")}&handle=${initial.headers.get("electric-handle")}`,
		),
	);
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({
		_tag: "Unavailable",
		message: "Unsupported event schema",
	});
	expect(response.headers.has("electric-offset")).toBe(false);
});

test("T15 test-only v0 conversion runs before emission and malformed v1 cannot escape", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { UpcasterRegistry } = await import(
		"../../packages/sync/src/upcasters"
	);
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	// Only this disposable fixture permits the historical version; production stays >0.
	await db.sql`ALTER TABLE event DROP CONSTRAINT event_schema_version_check`;
	const registry = new UpcasterRegistry();
	registry.register("foundation:probe-upserted", 0, () => ({
		id: "converted-id",
		value: "converted-value",
	}));
	const engine = new ShapeEngine(db.sql, registry);
	const initial = await engine.shape(
		"versions",
		new URL("http://test/?table=sync_probe&offset=-1"),
	);
	await db.sql`INSERT INTO org_event_counter(org,seq) VALUES ('versions',1)`;
	await db.sql`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid) VALUES ('versions',1,'foundation:probe-upserted','actor','{"legacy":"old"}',0,pg_current_xact_id()::text::bigint)`;
	const url = new URL(
		`http://test/?table=sync_probe&offset=${initial.headers.get("electric-offset")}&handle=${initial.headers.get("electric-handle")}`,
	);
	const response = await engine.shape("versions", url);
	expect(response.status).toBe(200);
	const messages = await response.json();
	expect(messages[0].key).toBe(JSON.stringify(["versions", "converted-id"]));
	expect(messages[0].value).toEqual({
		org: "versions",
		id: "converted-id",
		value: "converted-value",
		last_seq: "1",
	});
	await db.sql`UPDATE event SET schema_version=1,payload='{"id":"invalid","value":42}' WHERE org='versions'`;
	const invalid = await engine.shape("versions", url);
	expect(invalid.status).toBe(503);
});

test("T18 requested log modes stay in server telemetry, never in schema metadata", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const modes: string[] = [];
	const engine = new ShapeEngine(db.sql, undefined, (entry) =>
		modes.push(entry.log),
	);
	for (const log of ["full", "changes_only"]) {
		const response = await engine.shape(
			"logs",
			new URL(`http://test/?table=sync_probe&offset=-1&log=${log}`),
		);
		expect(response.status).toBe(200);
		expect(
			Object.keys(JSON.parse(response.headers.get("electric-schema") ?? "{}")),
		).toEqual(["org", "id", "value", "last_seq"]);
	}
	expect(modes).toEqual(["full", "changes_only"]);
});

test.each([
	"restart",
	"expiry",
] as const)("T12 stock collection recovers after engine %s without retaining deleted snapshot rows", async (mode) => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { writeProbe, deleteProbe } = await import(
		"../../packages/domain/src/index"
	);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const db = await disposablePostgres();
	await migrate(db.sql);
	await writeProbe(db.sql, "restart", "actor", "old", "before");
	const authorize = (org: string, headers: Readonly<Record<string, string>>) =>
		headers.authorization === `Bearer ${org}`
			? ("ok" as const)
			: ("unauthenticated" as const);
	let http = foundationHandler(db.sql, new ShapeEngine(db.sql), authorize);
	const statuses: number[] = [];
	const handles: string[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: async (request) => {
			const response = await http.handler(request);
			statuses.push(response.status);
			if (new URL(request.url).searchParams.get("offset") === "-1")
				handles.push(response.headers.get("electric-handle") ?? "");
			return response;
		},
	});
	const collection = createCollection(
		electricCollectionOptions<{
			org: string;
			id: string;
			value: string;
			last_seq: string;
		}>({
			id: `restart:${crypto.randomUUID()}`,
			getKey: (row) => JSON.stringify([row.org, row.id]),
			shapeOptions: {
				url: `${server.url.origin}/orgs/restart/v1/shape`,
				params: { table: "sync_probe" },
				headers: { authorization: "Bearer restart" },
			},
		}),
	);
	try {
		await collection.preload();
		expect(collection.get(JSON.stringify(["restart", "old"]))?.value).toBe(
			"before",
		);
		if (mode === "restart") {
			const previous = http;
			http = foundationHandler(db.sql, new ShapeEngine(db.sql), authorize);
			await previous.dispose();
		} else {
			const { vi } = await import("vitest");
			const now = Date.now.bind(Date);
			vi.spyOn(Date, "now").mockImplementation(() => now() + 300001);
		}
		await deleteProbe(db.sql, "restart", "actor", "old");
		const mutation = await writeProbe(
			db.sql,
			"restart",
			"actor",
			"new",
			"after",
		);
		await expect
			.poll(() => statuses.includes(409), { timeout: 10000 })
			.toBe(true);
		await expect
			.poll(() => collection.get(JSON.stringify(["restart", "new"]))?.value, {
				timeout: 10000,
			})
			.toBe("after");
		expect(collection.has(JSON.stringify(["restart", "old"]))).toBe(false);
		expect(collection.size).toBe(1);
		expect(handles.length).toBeGreaterThanOrEqual(2);
		expect(handles.at(-1)).not.toBe(handles[0]);
		const next = await writeProbe(
			db.sql,
			"restart",
			"actor",
			"new",
			"live again",
		);
		expect(next.txid).toBeGreaterThan(mutation.txid);
		await collection.utils.awaitTxId(next.txid, 5000);
		expect(collection.get(JSON.stringify(["restart", "new"]))?.value).toBe(
			"live again",
		);
	} finally {
		await collection.cleanup();
		server.stop(true);
		await http.dispose();
		await db.close();
		const { vi } = await import("vitest");
		vi.restoreAllMocks();
	}
});

test("T12 cursors are issued per handle and reject forged or cross-handle continuations", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "probe", "initial");
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = { authorization: "Bearer org-a" };
	const first = await fetch(`${base}&offset=-1`, { headers });
	const second = await fetch(`${base}&offset=-1`, { headers });
	const handle = first.headers.get("electric-handle");
	const other = second.headers.get("electric-handle");
	const offset = first.headers.get("electric-offset");
	expect(offset).not.toBe(second.headers.get("electric-offset"));
	const crossed = await fetch(`${base}&handle=${other}&offset=${offset}`, {
		headers,
	});
	expect(crossed.status).toBe(409);
	expect(await crossed.json()).toEqual([
		{ headers: { control: "must-refetch" } },
	]);
	const forged = await fetch(`${base}&handle=${handle}&offset=999999_0`, {
		headers,
	});
	expect(forged.status).toBe(409);
	for (const invalid of ["s:-100", "s:NaN", "1e3_0", "-2"]) {
		const response = await fetch(`${base}&handle=${handle}&offset=${invalid}`, {
			headers,
		});
		expect(response.status).toBe(400);
	}
	const resumed = await fetch(`${base}&handle=${handle}&offset=${offset}`, {
		headers,
	});
	expect(resumed.status).toBe(200);
});

test("T23 retries preserve identities, unrelated events advance and bigint boundaries stay exact", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes } = await import("../../packages/domain/src/index");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await db.sql`INSERT INTO org_event_counter(org,seq) VALUES ('big','9007199254740992')`;
	const engine = new ShapeEngine(db.sql);
	const shape = (offset: string, handle = "") =>
		engine.shape(
			"big",
			new URL(
				`http://test/?table=sync_probe&offset=${offset}&handle=${handle}`,
			),
		);
	const initial = await shape("-1");
	const handle = initial.headers.get("electric-handle") ?? "";
	const cursor = initial.headers.get("electric-offset") ?? "";
	await mutateProbes(db.sql, "big", "actor", [
		{ operation: "upsert", id: "same", value: "one" },
		{ operation: "upsert", id: "same", value: "two" },
	]);
	await db.sql.begin(async (tx) => {
		const [row] =
			await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org='big' RETURNING seq::text`;
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid) VALUES ('big',${row.seq},'other:changed','actor','{}',1,pg_current_xact_id()::text::bigint)`;
	});
	const first = await shape(cursor, handle);
	const replay = await shape(cursor, handle);
	const messages = await first.json();
	expect(await replay.json()).toEqual(messages);
	expect(replay.headers.get("electric-offset")).toBe(
		first.headers.get("electric-offset"),
	);
	const changes = messages.filter(
		(message: { headers: { operation?: string } }) => message.headers.operation,
	);
	expect(
		changes.map(
			(message: { value: { last_seq: string } }) => message.value.last_seq,
		),
	).toEqual(["9007199254740993", "9007199254740994"]);
	const applied = new Map<string, string>();
	const identities = new Set<string>();
	for (const message of [...changes, ...changes]) {
		const identity = `${message.value.org}:${message.value.last_seq}`;
		if (identities.has(identity)) continue;
		identities.add(identity);
		applied.set(message.key, message.value.value);
	}
	expect([...identities]).toEqual([
		"big:9007199254740993",
		"big:9007199254740994",
	]);
	expect([...applied]).toEqual([[JSON.stringify(["big", "same"]), "two"]]);
	const next = first.headers.get("electric-offset") ?? "";
	const drained = await shape(next, handle);
	expect(await drained.json()).toEqual([
		{ headers: { control: "up-to-date" } },
	]);
	expect(drained.headers.get("electric-offset")).toBe(next);
	await mutateProbes(db.sql, "big", "actor", [
		{ operation: "upsert", id: "same", value: "three" },
	]);
	const final = await shape(next, handle);
	const finalMessages = await final.json();
	expect(finalMessages[0].value.last_seq).toBe("9007199254740996");
});

test("T07 immutable snapshot pages survive updates and deletes; tail only declares caught-up at its boundary", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes } = await import("../../packages/domain/src/index");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await mutateProbes(
		db.sql,
		"pages",
		"actor",
		Array.from({ length: 205 }, (_, i) => ({
			operation: "upsert" as const,
			id: `row-${String(i).padStart(3, "0")}`,
			value: "before",
		})),
	);
	const engine = new ShapeEngine(db.sql);
	const shape = (offset: string, handle = "") =>
		engine.shape(
			"pages",
			new URL(
				`http://test/?table=sync_probe&offset=${offset}&handle=${handle}`,
			),
		);
	const initial = await shape("-1");
	const handle = initial.headers.get("electric-handle") ?? "";
	const rows = await initial.json();
	expect(rows).toHaveLength(100);
	expect(initial.headers.has("electric-up-to-date")).toBe(false);
	await mutateProbes(db.sql, "pages", "actor", [
		{ operation: "delete", id: "row-150" },
		...Array.from({ length: 104 }, (_, i) => ({
			operation: "upsert" as const,
			id: `row-${String(i + 100).padStart(3, "0")}`,
			value: "after",
		})),
	]);
	let offset = initial.headers.get("electric-offset") ?? "";
	for (let page = 0; page < 2; page++) {
		const response = await shape(offset, handle);
		rows.push(
			...(await response.json()).filter(
				(message: { value?: unknown }) => message.value,
			),
		);
		offset = response.headers.get("electric-offset") ?? "";
	}
	expect(rows).toHaveLength(205);
	expect(new Set(rows.map((row: { key: string }) => row.key)).size).toBe(205);
	expect(
		rows.every(
			(row: { value: { value: string } }) => row.value.value === "before",
		),
	).toBe(true);
	const tail = await shape(offset, handle);
	const events = await tail.json();
	expect(events).toHaveLength(100);
	expect(tail.headers.has("electric-up-to-date")).toBe(false);
	const rest = await shape(tail.headers.get("electric-offset") ?? "", handle);
	const remaining = await rest.json();
	expect(remaining).toHaveLength(6);
	expect(rest.headers.get("electric-up-to-date")).toBe("true");
	const projection = new Map<
		string,
		{ id: string; value: string; last_seq: string }
	>(
		rows.map(
			(row: {
				key: string;
				value: { id: string; value: string; last_seq: string };
			}) => [row.key, row.value],
		),
	);
	for (const message of [...events, ...remaining]) {
		if (message.headers.operation === "delete") projection.delete(message.key);
		else if (message.value) projection.set(message.key, message.value);
	}
	const persisted =
		await db.sql`SELECT id,value,last_seq::text FROM sync_probe WHERE org='pages' ORDER BY id`;
	expect(
		[...projection.values()]
			.map(({ id, value, last_seq }) => ({ id, value, last_seq }))
			.sort((a, b) => a.id.localeCompare(b.id)),
	).toEqual([...persisted]);
});

test("T05 multi-event mutation reserves contiguous sequences with one committed txid", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes } = await import("../../packages/domain/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const result = await mutateProbes(db.sql, "batch-org", "actor", [
		{ operation: "upsert", id: "a", value: "first" },
		{ operation: "upsert", id: "b", value: "second" },
	]);
	const events =
		await db.sql`SELECT seq::text, txid::text FROM event WHERE org='batch-org' ORDER BY seq`;
	expect(events.map((event) => event.seq)).toEqual(["1", "2"]);
	const physical =
		await db.sql`SELECT xmin::text AS txid FROM event WHERE org='batch-org'`;
	expect(physical.map((event) => event.txid)).toEqual([
		String(result.txid),
		String(result.txid),
	]);
	expect(events.map((event) => event.txid)).toEqual([
		String(result.txid),
		String(result.txid),
	]);
	expect(
		await db.sql`SELECT id FROM sync_probe WHERE org='batch-org' ORDER BY id`,
	).toEqual([{ id: "a" }, { id: "b" }]);
});

test("T04 failed batch rolls back appended events, counter and projection; T10 missing delete is inert", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes, writeProbe } = await import(
		"../../packages/domain/src/index"
	);
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await writeProbe(db.sql, "rollback-org", "actor", "a", "original");
	await expect(
		mutateProbes(db.sql, "rollback-org", "actor", [
			{ operation: "upsert", id: "a", value: "uncommitted" },
			{ operation: "delete", id: "absent" },
		]),
	).rejects.toThrow("Probe not found");
	expect(
		await db.sql`SELECT seq::text FROM org_event_counter WHERE org='rollback-org'`,
	).toEqual([{ seq: "1" }]);
	expect(
		await db.sql`SELECT seq::text FROM event WHERE org='rollback-org'`,
	).toEqual([{ seq: "1" }]);
	expect(
		await db.sql`SELECT value, last_seq::text FROM sync_probe WHERE org='rollback-org'`,
	).toEqual([{ value: "original", last_seq: "1" }]);
	const result = await mutateProbes(db.sql, "rollback-org", "actor", [
		{ operation: "delete", id: "a" },
	]);
	expect(
		await db.sql`SELECT id FROM sync_probe WHERE org='rollback-org'`,
	).toHaveLength(0);
	expect(
		await db.sql`SELECT seq::text, plugin_type, txid::text FROM event WHERE org='rollback-org' AND seq=2`,
	).toEqual([
		{
			seq: "2",
			plugin_type: "foundation:probe-deleted",
			txid: String(result.txid),
		},
	]);
});

test("T06 migrations serialize, repeat safely, and reject checksum drift", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await Promise.all([migrate(db.sql), migrate(db.sql)]);
	expect((await db.sql`SELECT version FROM stellarc_migration`).length).toBe(1);
	await db.sql`UPDATE stellarc_migration SET checksum='invalid'`;
	await expect(migrate(db.sql)).rejects.toThrow("Migration checksum mismatch");
});
afterEach(async () => {
	for (const close of resources.splice(0).reverse()) await close();
});

test("T01 stock reconnect retries the boundary page and accounts for every committed event", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("accounting", "one", "before");
	let raced = false;
	server.afterProjectionRead = async () => {
		if (raced) return;
		raced = true;
		await server.write("accounting", "one", "raced");
	};
	let lostUrl: string | undefined;
	let retriedUrl: string | undefined;
	const received: string[] = [];
	const collection = createCollection(
		electricCollectionOptions<{
			org: string;
			id: string;
			value: string;
			last_seq: string;
		}>({
			id: `accounting:${crypto.randomUUID()}`,
			getKey: (row) => JSON.stringify([row.org, row.id]),
			shapeOptions: {
				url: `${server.url}/orgs/accounting/v1/shape`,
				params: { table: "sync_probe" },
				headers: { authorization: "Bearer accounting" },
				fetchClient: Object.assign(
					async (
						input: Parameters<typeof fetch>[0],
						init?: Parameters<typeof fetch>[1],
					) => {
						const response = await fetch(input, init);
						if (response.status !== 200) return response;
						const messages = await response.clone().json();
						const changes = messages.filter(
							(message: { headers: { txids?: number[] } }) =>
								message.headers.txids,
						);
						if (changes.length && !lostUrl) {
							lostUrl = String(input);
							await server.write("accounting", "two", "offline");
							await server.write("accounting", "one", "latest");
							throw new TypeError(
								"simulated connection loss before page acknowledgement",
							);
						}
						if (changes.length && lostUrl && !retriedUrl)
							retriedUrl = String(input);
						for (const message of changes)
							received.push(`${message.value.org}:${message.value.last_seq}`);
						return response;
					},
					{ preconnect: fetch.preconnect },
				),
			},
		}),
	);
	try {
		await collection.preload();
		await expect
			.poll(
				() => collection.get(JSON.stringify(["accounting", "one"]))?.value,
				{ timeout: 10000 },
			)
			.toBe("latest");
		expect(collection.get(JSON.stringify(["accounting", "two"]))?.value).toBe(
			"offline",
		);
		expect(collection.size).toBe(2);
		expect(received).toEqual(["accounting:2", "accounting:3", "accounting:4"]);
		expect(await server.eventCount("accounting")).toBe(4);
		expect(lostUrl).toBeDefined();
		expect(retriedUrl).toBe(lostUrl);
	} finally {
		await collection.cleanup();
	}
});

test("T01 snapshot/reconnect retains the mutation committed between projection and counter reads", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "first", "before");
	let resume!: () => void;
	let observed!: () => void;
	const paused = new Promise<void>((resolve) => {
		observed = resolve;
	});
	const released = new Promise<void>((resolve) => {
		resume = resolve;
	});
	server.afterProjectionRead = async () => {
		observed();
		await released;
	};
	const initial = fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
		{
			headers: { authorization: "Bearer org-a" },
		},
	);
	await paused;
	const mutation = await server.write("org-a", "first", "after");
	resume();
	const snapshot = await initial;
	expect(snapshot.status).toBe(200);
	const snapshotMessages = await snapshot.json();
	expect(snapshotMessages[0].value.value).toBe("before");
	const handle = snapshot.headers.get("electric-handle") ?? "";
	const offset = snapshot.headers.get("electric-offset") ?? "";
	const continuation = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&handle=${handle}&offset=${offset}`,
		{
			headers: { authorization: "Bearer org-a" },
		},
	);
	const tail = await continuation.json();
	const changes = tail.filter(
		(message: { headers: { operation?: string } }) => message.headers.operation,
	);
	expect(changes).toHaveLength(1);
	expect(changes[0].headers.txids).toEqual([mutation.txid]);
	expect(changes[0].value.last_seq).toBe("2");
	expect(changes[0].value.value).toBe("after");
	server.afterProjectionRead = undefined;
	const collection = createCollection(
		electricCollectionOptions({
			id: "sync_probe:org-a",
			shapeOptions: {
				url: `${server.url}/orgs/org-a/v1/shape`,
				params: { table: "sync_probe" },
				headers: { authorization: "Bearer org-a" },
			},
			getKey: (row: {
				org: string;
				id: string;
				value: string;
				last_seq: bigint;
			}) => JSON.stringify([row.org, row.id]),
		}),
	);
	resources.push(async () => {
		await collection.cleanup();
	});
	await collection.preload();
	expect(collection.get(JSON.stringify(["org-a", "first"]))?.value).toBe(
		"after",
	);
}, 30_000);

test("T10 delete emits a stable-key delete and missing delete leaves the log unchanged", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "probe", "present");
	const initial = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
		{ headers: { authorization: "Bearer org-a" } },
	);
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	const deleted = await server.delete("org-a", "probe");
	const tail = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&handle=${handle}&offset=${offset}`,
		{ headers: { authorization: "Bearer org-a" } },
	);
	const messages = await tail.json();
	expect(messages[0]).toEqual({
		key: JSON.stringify(["org-a", "probe"]),
		value: { org: "org-a", id: "probe" },
		headers: {
			operation: "delete",
			relation: ["public", "sync_probe"],
			txids: [deleted.txid],
		},
	});
	const before = await server.eventCount("org-a");
	await expect(server.delete("org-a", "missing")).rejects.toThrow("NotFound");
	expect(await server.eventCount("org-a")).toBe(before);
});

test("T13 HTTP telemetry exports denied requests with safe error types and inbound trace context", async () => {
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { disposablePostgres } = await import("../helpers/postgres");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	const http = foundationHandler(
		db.sql,
		new ShapeEngine(db.sql),
		(_org, headers) =>
			headers.authorization ? "forbidden" : "unauthenticated",
		undefined,
		telemetry.layer,
	);
	try {
		for (const [authorization, status, tag] of [
			["", 401, "Unauthenticated"],
			["Bearer private-token", 403, "Forbidden"],
		] as const) {
			const response = await http.handler(
				new Request(
					"http://test/orgs/secret-org/v1/shape?table=sync_probe&offset=-1",
					{
						headers: {
							authorization,
							traceparent:
								"00-12345678901234567890123456789012-1234567890123456-01",
						},
					},
				),
			);
			expect(response.status).toBe(status);
			const spans = telemetry.spans
				.getFinishedSpans()
				.filter(
					(span) =>
						span.name === "stellarc.http.request" &&
						span.attributes["http.response.status_code"] === status,
				);
			expect(spans).toHaveLength(1);
			expect(spans[0].attributes["error.type"]).toBe(tag);
			expect(spans[0].attributes["http.route"]).toBe("/orgs/:org/v1/shape");
			expect(spans[0].attributes["http.request.method"]).toBe("GET");
			expect(spans[0].spanContext().traceId).toBe(
				"12345678901234567890123456789012",
			);
			expect(
				Object.keys(spans[0].attributes).some((key) =>
					key.includes("principal"),
				),
			).toBe(false);
			expect(JSON.stringify(spans[0].attributes)).not.toContain(
				"private-token",
			);
		}
	} finally {
		await http.dispose();
		await db.close();
	}
});

test("T13 missing auth is 401 and wrong-org capability is 403 with no data leakage", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "secret", "value");
	const noAuth = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
	);
	expect(noAuth.status).toBe(401);
	expect(await noAuth.json()).toEqual({
		_tag: "Unauthenticated",
		message: "Authentication required",
	});
	expect(noAuth.headers.has("electric-handle")).toBe(false);
	const wrongOrg = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
		{ headers: { authorization: "Bearer org-b" } },
	);
	expect(wrongOrg.status).toBe(403);
	expect(await wrongOrg.json()).toEqual({
		_tag: "Forbidden",
		message: "Access denied",
	});
	expect(wrongOrg.headers.has("electric-handle")).toBe(false);
});

test("T04 exception after event append rolls back counter, event and projection together", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await expect(
		db.sql.begin(async (tx) => {
			await tx`INSERT INTO org_event_counter(org) VALUES ('org-a') ON CONFLICT DO NOTHING`;
			const [counter] =
				await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org='org-a' RETURNING seq::text`;
			const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
			await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
        VALUES ('org-a',${counter.seq},'foundation:probe-upserted','test-actor',${tx.json({ id: "x", value: "y" })},1,${transaction.txid})`;
			await tx`INSERT INTO sync_probe(org,id,value,last_seq) VALUES ('org-a','x','y',${counter.seq})`;
			throw new Error("forced rollback");
		}),
	).rejects.toThrow("forced rollback");
	const [counterRow] =
		await db.sql`SELECT seq FROM org_event_counter WHERE org='org-a'`;
	expect(counterRow).toBeUndefined();
	const [eventRow] = await db.sql`SELECT 1 FROM event WHERE org='org-a'`;
	expect(eventRow).toBeUndefined();
	const [probeRow] =
		await db.sql`SELECT 1 FROM sync_probe WHERE org='org-a' AND id='x'`;
	expect(probeRow).toBeUndefined();
	// Next write on the same org still succeeds, proving no partial lock/state leaked.
	const { writeProbe } = await import("../../packages/domain/src/index");
	const result = await writeProbe(db.sql, "org-a", "test-actor", "x", "y");
	expect(result.txid).toBeGreaterThan(0);
});

test("successful shape requests export principal context on the server span", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const db = await disposablePostgres();
	const telemetry = TelemetryTest();
	await migrate(db.sql);
	const web = foundationHandler(
		db.sql,
		new ShapeEngine(db.sql),
		(org, _headers, principal) =>
			org === "audited" && principal === "actor-7" ? "ok" : "forbidden",
		undefined,
		telemetry.layer,
	);
	try {
		const response = await web.handler(
			new Request("http://test/orgs/audited/v1/shape?table=sync_probe&offset=-1", {
				headers: { authorization: "Bearer audited actor-7" },
			}),
		);
		expect(response.status).toBe(200);
		await response.text();
		const requests = telemetry.spans
			.getFinishedSpans()
			.filter((span) => span.name === "stellarc.http.request");
		expect(requests).toHaveLength(1);
		const attributes = requests[0].attributes as Record<string, unknown>;
		expect(attributes["http.route"]).toBe("/orgs/:org/v1/shape");
		expect(attributes["http.request.method"]).toBe("GET");
		expect(attributes["http.response.status_code"]).toBe(200);
		expect(attributes["stellarc.org"]).toBe("audited");
		expect(attributes["stellarc.principal.kind"]).toBe("actor");
		const denied = await web.handler(
			new Request("http://test/orgs/audited/v1/shape?table=sync_probe&offset=-1", {
				headers: { authorization: "Bearer audited other" },
			}),
		);
		expect(denied.status).toBe(403);
		await denied.text();
		const deniedSpans = telemetry.spans
			.getFinishedSpans()
			.filter((span) => span.name === "stellarc.http.request");
		expect(deniedSpans).toHaveLength(2);
		expect(
			(deniedSpans[1].attributes as Record<string, unknown>)["error.type"],
		).toBe("Forbidden");
		// Denied requests must not carry principal identity attributes.
		expect(
			(deniedSpans[1].attributes as Record<string, unknown>)[
				"stellarc.principal.kind"
			],
		).toBeUndefined();
	} finally {
		await web.dispose();
		await db.close();
	}
});

test("mutation, event appends and shape emission share one trace", async () => {
	const server = await startTestServer();
	const telemetry = server.telemetry;
	try {
		const { txid } = await server.write("traced", "one", "v1");
		expect(txid).toBeGreaterThan(0);
		const traceparent = `00-${"3".repeat(32)}-${"4".repeat(16)}-01`;
		const response = await fetch(
			`${server.url}/orgs/traced/v1/shape?table=sync_probe&offset=-1`,
			{ headers: { authorization: "Bearer traced", traceparent } },
		);
		expect(response.status).toBe(200);
		await response.text();
		await telemetry.reader.forceFlush();
		const spans = telemetry.spans.getFinishedSpans();
		const appends = spans.filter((s) => s.name === "stellarc.event.append");
		expect(appends.length).toBeGreaterThanOrEqual(1);
		const snapshot = spans.find((s) => s.name === "stellarc.shape.snapshot");
		expect(snapshot).toBeDefined();
		// Inbound traceparent on the shape request keeps the snapshot span inside
		// the caller's trace; the mutation's appends share the mutation trace.
		expect(snapshot?.spanContext().traceId).toBe("3".repeat(32));
		const traceIds = new Set(appends.map((s) => s.spanContext().traceId));
		expect(traceIds.size).toBe(1);
		const mutating = appends[0].attributes as Record<string, unknown>;
		expect(mutating["stellarc.event.type"]).toBe("foundation:probe-upserted");
		expect(Number(mutating["stellarc.event.seq"])).toBe(1);
		expect(Number(mutating["stellarc.event.txid"])).toBe(txid);
	} finally {
		await server.close();
	}
});
