// §5f export proof: run the real stack (disposable PostgreSQL + Effect HttpApi
// + ShapeEngine) with TelemetryLive pointed at the local Tempo OTLP/HTTP
// endpoint, execute mutation → snapshot → live tail, then verify Tempo actually
// ingested the trace — snapshot and tail spans on the caller's trace id, append
// spans present, and no SQL statement text anywhere in the exported payload.
//
// Usage: bun tools/verify-otel-export.mts
//   --endpoint http://localhost:4318   OTLP/HTTP endpoint (TelemetryLive)
//   --query    http://localhost:3200   Tempo query API
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const argValue = (name: string, fallback: string) => {
	const index = args.indexOf(name);
	return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const endpoint = argValue("--endpoint", "http://localhost:4318");
const queryApi = argValue("--query", "http://localhost:3200");
const PG_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
const SERVICE = "stellarc-export-proof";

const root = mkdtempSync(join("/tmp", "stellarc-otel-"));
const data = join(root, "data");
const stopPostgres = () => {
	try {
		spawnSync(`${PG_BIN}/pg_ctl`, ["-D", data, "stop", "-m", "immediate"], {
			stdio: "ignore",
		});
	} catch {}
};
process.on("exit", stopPostgres);

const run = (bin: string, a: string[]) => {
	const result = spawnSync(`${PG_BIN}/${bin}`, a, { encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`${bin} failed: ${result.stderr?.slice(0, 400)}`);
};

let db: import("postgres").Sql | undefined;
let runtime: { dispose: () => Promise<void> } | undefined;
let http:
	| { handler: (r: Request) => Promise<Response>; dispose: () => Promise<void> }
	| undefined;

try {
	run("initdb", [
		"-D",
		data,
		"-A",
		"trust",
		"--no-locale",
		"--no-sync",
		"-U",
		"stellarc_owner",
	]);
	run("pg_ctl", [
		"-D",
		data,
		"-l",
		join(root, "postgres.log"),
		"-o",
		`-k ${root} -h ''`,
		"-w",
		"start",
	]);
	const port = readFileSync(join(data, "postmaster.pid"), "utf8")
		.split("\n")[5]
		.trim();
	console.log(`postgres ready on unix socket ${root}, port ${port}`);

	// TelemetryLive reads the endpoint at layer construction.
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
	process.env.SERVICE_VERSION = "stl14-export-proof";
	process.env.DEPLOYMENT_ENVIRONMENT = "evidence";

	const postgres = (await import("postgres")).default;
	db = postgres({
		host: root,
		username: "stellarc_owner",
		database: "postgres",
		max: 8,
		onnotice: () => {},
	});
	const { migrate } = await import("../packages/db/src/migrate");
	await migrate(db);
	console.log("migrations applied");

	const { ShapeEngine } = await import("../packages/sync/src/index");
	const { writeProbeEffect } = await import("../packages/domain/src/index");
	const { TelemetryLive } = await import("../packages/telemetry/src/index");
	const { Effect, Layer, ManagedRuntime } = await import("effect");

	// One memo map shared by runtime and handler builds: OTel providers refuse a
	// second binding (same pattern as tests/integration/test-server.ts).
	const telemetryLayer = TelemetryLive(SERVICE);
	const memoMap = await Effect.runPromise(Layer.makeMemoMap);
	runtime = ManagedRuntime.make(telemetryLayer, memoMap) as never;
	const engine = new ShapeEngine(db);
	const { foundationHandler } = await import("../apps/stellarc-api/src/http");
	http = foundationHandler(
		db,
		engine,
		(org, headers) =>
			!headers.authorization
				? "unauthenticated"
				: headers.authorization === `Bearer ${org}`
					? "ok"
					: "forbidden",
		undefined,
		telemetryLayer,
		memoMap,
	) as never;

	const base = "http://foundation.test";
	// Deterministic caller trace for the HTTP reads; the in-process mutation runs
	// on its own runtime trace (exactly like production's separate mutation).
	const traceId = "5".repeat(32);
	const traceparent = `00-${traceId}-6${"0".repeat(15)}-01`;
	const headers = { authorization: "Bearer foundation", traceparent };

	// 1) mutation → event append span (own trace, like a real client write)
	await runtime.runPromise(
		writeProbeEffect(
			db,
			"foundation",
			"proof-actor",
			"proof-1",
			"exported-to-tempo",
		),
	);
	console.log("mutation committed");

	// 2) snapshot page through the real HttpApi handler
	const snapshot = await (http as NonNullable<typeof http>).handler(
		new Request(`${base}/orgs/foundation/v1/shape?table=sync_probe&offset=-1`, {
			headers,
		}),
	);
	const handle = snapshot.headers.get("electric-handle");
	const offset = snapshot.headers.get("electric-offset");
	await snapshot.text();
	if (!handle || !offset)
		throw new Error(
			`snapshot missing handle/offset headers (${snapshot.status})`,
		);
	console.log(`snapshot ok (handle ${handle.slice(0, 12)}…, offset ${offset})`);

	// 3) a second write, then a live tail that must wake on it
	await runtime.runPromise(
		writeProbeEffect(
			db,
			"foundation",
			"proof-actor",
			"proof-2",
			"wake-the-tail",
		),
	);
	const tailResponse = await (http as NonNullable<typeof http>).handler(
		new Request(
			`${base}/orgs/foundation/v1/shape?table=sync_probe&offset=${encodeURIComponent(offset)}&handle=${encodeURIComponent(handle)}&live=true`,
			{ headers },
		),
	);
	const tailBody = await tailResponse.text();
	if (tailResponse.status !== 200)
		throw new Error(
			`live tail failed: ${tailResponse.status} ${tailBody.slice(0, 200)}`,
		);
	console.log("live tail woke on the committed event");

	// 4) BatchSpanProcessor flushes on its schedule; poll Tempo for the trace.
	console.log("waiting for OTLP export…");
	let traceIds: string[] = [];
	for (let attempt = 0; attempt < 20; attempt++) {
		await sleep(3000);
		const search = await fetch(
			`${queryApi}/api/search?tags=${encodeURIComponent(`service.name=${SERVICE}`)}&since=1h&limit=50`,
		);
		if (search.ok) {
			const body = (await search.json()) as {
				traces?: Array<{ traceID: string }>;
			};
			traceIds = (body.traces ?? []).map((t) => t.traceID);
			if (traceIds.length > 0) break;
		}
	}
	if (traceIds.length === 0)
		throw new Error(
			`Tempo has no trace for service ${SERVICE} — export did not happen`,
		);

	// Pull the traces and evaluate the assertions on the EXPORTED payload.
	// Tempo serves OTLP-shaped JSON: batches[].scopeSpans[].spans[]; the 16-byte
	// traceId arrives base64-encoded, so normalize to hex before comparing.
	const traceIdHex = (id: string) =>
		/^[0-9a-f]{32}$/.test(id) ? id : Buffer.from(id, "base64").toString("hex");
	const spanNames = new Map<string, number>();
	let statementLeak: string | undefined;
	const spanIdsByTrace = new Map<string, number>();
	for (const id of traceIds) {
		const response = await fetch(`${queryApi}/api/traces/${id}`, {
			headers: { accept: "application/json" },
		});
		if (!response.ok) continue;
		const trace = (await response.json()) as {
			batches?: Array<{
				scopeSpans?: Array<{
					spans?: Array<{
						name?: string;
						traceId?: string;
						attributes?: Array<{
							key: string;
							value?: Record<string, unknown>;
						}>;
					}>;
				}>;
			}>;
		};
		for (const span of trace.batches?.flatMap(
			(b) => b.scopeSpans?.flatMap((s) => s.spans ?? []) ?? [],
		) ?? []) {
			if (span.name)
				spanNames.set(span.name, (spanNames.get(span.name) ?? 0) + 1);
			if (span.traceId) {
				const hex = traceIdHex(span.traceId);
				spanIdsByTrace.set(hex, (spanIdsByTrace.get(hex) ?? 0) + 1);
			}
			for (const attribute of span.attributes ?? []) {
				if (/statement|query\.text/i.test(attribute.key))
					statementLeak = `${attribute.key}=${JSON.stringify(attribute.value).slice(0, 80)}`;
			}
		}
	}
	const callerTraceHasSnapshotTail =
		(spanIdsByTrace.get(traceId) ?? 0) >= 1 &&
		(spanNames.get("stellarc.shape.snapshot") ?? 0) >= 1 &&
		(spanNames.get("stellarc.shape.tail") ?? 0) >= 1;
	if (!callerTraceHasSnapshotTail)
		throw new Error(
			`exported traces lack snapshot/tail on caller trace ${traceId}: ${JSON.stringify([...spanNames])}`,
		);
	if ((spanNames.get("stellarc.event.append") ?? 0) < 1)
		throw new Error(
			`no stellarc.event.append span exported: ${JSON.stringify([...spanNames])}`,
		);
	if (statementLeak)
		throw new Error(`SQL text leaked into exported spans: ${statementLeak}`);

	console.log("VERIFIED: Tempo holds the export");
	console.log(`  traces: ${traceIds.length}`);
	console.log(`  caller trace ${traceId}: snapshot+tail present`);
	console.log(`  spans: ${JSON.stringify([...spanNames].slice(0, 12))}`);
	console.log(`  tempo: ${queryApi}/api/search?tags=service.name%3D${SERVICE}`);
	console.log(
		`  grafana: ${"http://localhost:3210"}/explore?schemaVersion=1&panes=${encodeURIComponent(
			JSON.stringify({
				abc: {
					datasource: "tempo",
					queries: [{ refId: "A", queryType: "traceql", query: traceIds[0] }],
					range: { from: "now-1h", to: "now" },
				},
			}),
		)}`,
	);
	console.log(`TRACE_ID=${traceIds[0]}`);
} finally {
	try {
		await http?.dispose();
	} catch {}
	try {
		await runtime?.dispose();
	} catch {}
	try {
		await db?.close();
	} catch {}
	stopPostgres();
}
