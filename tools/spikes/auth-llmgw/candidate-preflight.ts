import assert from "node:assert/strict";
import { Effect, ManagedRuntime } from "effect";
import postgres from "postgres";
import { auditExporter } from "../../../packages/core-auth/src/audit";
import { assertRuntimeDatabase } from "../../../packages/core-auth/src/database";
import { gatewayStore } from "../../../packages/core-auth/src/store";
import { TelemetryLive } from "../../../packages/telemetry/src/index";

// Operator-only metadata probe. Never bootstrap a human or call a provider.
const config = await Bun.file(
	`${process.env.HOME}/.config/stellarc-gateway/runtime.env`,
).text();
const dsn = config.trim().split("=", 2)[1];
const url = new URL(dsn);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55438");
assert.equal(url.pathname, "/stellarc_gateway_candidate");
assert.equal(url.username, "stellarc_gateway_runtime");
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:14318";
process.env.OTEL_RESOURCE_ATTRIBUTES =
	"deployment.environment.name=development,stellarc.proof=metadata-preflight";
process.env.SERVICE_VERSION = "v79-metadata-preflight";
const sql = postgres(dsn, {
	max: 1,
	connect_timeout: 3,
	onnotice: () => {},
	connection: { statement_timeout: 3000 },
});
const runtime = ManagedRuntime.make(TelemetryLive("stellarc-gateway"));
const request = crypto.randomUUID();
let trace = "";
try {
	await assertRuntimeDatabase(sql);
	assert.equal(
		(await sql`SELECT count(*)::int AS n FROM gw_identity_binding`)[0].n,
		0,
	);
	await runtime.runPromise(
		Effect.gen(function* () {
			const span = yield* Effect.currentSpan;
			trace = span.traceId;
			yield* Effect.promise(() =>
				gatewayStore(sql).securityEvent(
					"deployment.preflight",
					"anonymous",
					request,
					trace,
				),
			);
			yield* Effect.logInfo(
				"Stellarc metadata-only deployment preflight; no login or inference",
			);
		}).pipe(Effect.withSpan("stellarc.gateway.deployment.preflight")),
	);
	const accepted = await auditExporter(
		sql,
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
	).exportOnce();
	const rows =
		await sql`SELECT id,kind,trace FROM gw_audit WHERE request=${request}`;
	assert.equal(rows.length, 1);
	assert.equal(rows[0].kind, "deployment.preflight");
	assert.equal(rows[0].trace, trace);
	console.log(
		JSON.stringify({
			scope: "metadata-only preflight, not human login/inference",
			request,
			trace,
			eventId: rows[0].id,
			accepted,
			realOidc: false,
			realInference: false,
		}),
	);
} finally {
	await runtime.dispose();
	await sql.end();
}
