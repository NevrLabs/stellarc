import { Effect, ManagedRuntime, Metric } from "effect";
import { TelemetryLive } from "../../../packages/telemetry/src/index";

// Metadata-only runtime probe, not proof of OIDC or live provider operation.
const runtime = ManagedRuntime.make(TelemetryLive("stellarc-authgw-spike"));
const requestId = crypto.randomUUID();
let traceId = "";
await runtime.runPromise(
	Effect.gen(function* () {
		const span = yield* Effect.currentSpan;
		traceId = span.traceId;
		yield* Effect.annotateCurrentSpan({
			"request.id": requestId,
			"provider.name": "local-fixture",
			"stellarc.actor": "fixture-actor",
			"stellarc.org": "spike-dev",
		});
		yield* Effect.logWarning("authgw:telemetry-proof").pipe(
			Effect.annotateLogs({
				"request.id": requestId,
				"stellarc.actor": "fixture-actor",
				"stellarc.org": "spike-dev",
				"verification.kind": "metadata-probe-not-live-login",
			}),
		);
		yield* Metric.update(Metric.counter("authgw_telemetry_proof_total"), 1);
	}).pipe(Effect.withSpan("authgw.telemetry-proof")),
);
await runtime.dispose();
console.log(
	JSON.stringify({
		requestId,
		traceId,
		service: "stellarc-authgw-spike",
		kind: "metadata-probe-not-live-login",
	}),
);
