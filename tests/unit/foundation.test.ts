import { ConfigProvider, Effect } from "effect";
import { expect, test } from "vitest";

test("T17 configuration refuses missing database and invalid ports; Authz defaults deny", async () => {
	const { AppConfig, ConfigLive } = await import(
		"../../apps/stellarc-api/src/config"
	);
	const { Authz, AuthzLive } = await import("../../packages/domain/src/authz");
	const load = (entries: [string, string][]) =>
		Effect.runPromise(
			AppConfig.pipe(
				Effect.provide(ConfigLive),
				Effect.withConfigProvider(ConfigProvider.fromMap(new Map(entries))),
			),
		);
	await expect(load([])).rejects.toThrow();
	await expect(
		load([
			["DATABASE_URL", "postgres://localhost/test"],
			["PORT", "0"],
		]),
	).rejects.toThrow();
	const config = await load([
		["DATABASE_URL", "postgres://localhost/test"],
		["PORT", "4321"],
	]);
	expect(config.port).toBe(4321);
	const authz = await Effect.runPromise(Authz.pipe(Effect.provide(AuthzLive)));
	expect(authz.authorize("org", {})).toBe("unauthenticated");
	expect(authz.authorize("org", { authorization: "Bearer org" })).toBe(
		"forbidden",
	);
});

import { safeTxid } from "../../packages/domain/src/index";
import { UpcasterRegistry } from "../../packages/sync/src/upcasters";

test("TelemetryTest exports real Effect spans, metrics and logs with resource identity", async () => {
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { Metric } = await import("effect");
	const telemetry = TelemetryTest();
	const { ManagedRuntime } = await import("effect");
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		await runtime.runPromise(
			Effect.gen(function* () {
				yield* Effect.logInfo("safe log");
				yield* Metric.increment(Metric.counter("stellarc_test_total"));
			}).pipe(Effect.withSpan("test.operation")),
		);
		await telemetry.reader.forceFlush();
		await telemetry.logProcessor.forceFlush();
		const spans = telemetry.spans.getFinishedSpans();
		expect(spans.map((span) => span.name)).toContain("test.operation");
		expect(spans[0].resource.attributes["service.name"]).toBe("stellarc-test");
		expect(
			telemetry.logs.getFinishedLogRecords().map((log) => log.body),
		).toContain("safe log");
		expect(telemetry.metrics.getMetrics().length).toBeGreaterThan(0);
	} finally {
		await runtime.dispose();
	}
});

test("T15 version chains validate identity, synthetic v0, and reject unknown schemas", () => {
	const registry = new UpcasterRegistry();
	const type = "foundation:probe-upserted";
	expect(registry.decode(type, 1, { id: "a", value: "v1" })).toEqual({
		id: "a",
		value: "v1",
	});
	expect(() => registry.decode(type, 0, { legacy: "a" })).toThrow(
		"Unsupported event schema",
	);
	registry.register(type, 0, (payload) => {
		if (
			typeof payload !== "object" ||
			payload === null ||
			!("legacy" in payload)
		)
			throw new Error("Invalid fixture");
		return { id: payload.legacy, value: "converted" };
	});
	expect(registry.decode(type, 0, { legacy: "a" })).toEqual({
		id: "a",
		value: "converted",
	});
	for (const version of [-1, 0.5, 2, Number.NaN])
		expect(() => registry.decode(type, version, {})).toThrow(
			"Unsupported event schema",
		);
	expect(() => registry.decode("unknown:type", 1, {})).toThrow(
		"Unsupported event schema",
	);
	expect(() => registry.decode(type, 1, { id: "", value: 42 })).toThrow(
		"Unsupported event schema",
	);
	expect(registry.decode("foundation:probe-deleted", 1, { id: "a" })).toEqual({
		id: "a",
	});
});

test("transaction IDs reject overflow rather than rounding", () => {
	expect(safeTxid("123")).toBe(123);
	expect(() => safeTxid("9007199254740992")).toThrow(
		"Unsupported transaction ID",
	);
	expect(() => safeTxid("0")).toThrow("Unsupported transaction ID");
});
