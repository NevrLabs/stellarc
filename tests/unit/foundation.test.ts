import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

test("T18 shape query allowlist rejects every undocumented parameter before SQL", async () => {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const postgres = (await import("postgres")).default;
	const sql = postgres("postgres://localhost:1/unused", { connect_timeout: 1 });
	try {
		const engine = new ShapeEngine(sql);
		for (const name of [
			"where",
			"columns",
			"replica",
			"subset__limit",
			"live_sse",
			"params[1]",
			"unknown",
		]) {
			const url = new URL(
				"http://localhost/orgs/org/v1/shape?table=sync_probe&offset=-1",
			);
			url.searchParams.set(name, "");
			expect((await engine.shape("org", url)).status, name).toBe(400);
		}
	} finally {
		await sql.end();
	}
});

test("shape log modes reach the OTel logger without leaking request values", async () => {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { ManagedRuntime } = await import("effect");
	const postgres = (await import("postgres")).default;
	const sql = postgres("postgres://localhost:1/unused", { connect_timeout: 1 });
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		const engine = new ShapeEngine(sql);
		for (const mode of ["full", "changes_only", "private-request-value"]) {
			await runtime.runPromise(
				engine.shapeEffect(
					"org",
					new URL(
						`http://localhost/orgs/org/v1/shape?table=sync_probe&offset=-1&where=&log=${mode}`,
					),
				),
			);
		}
		await telemetry.logProcessor.forceFlush();
		const records = telemetry.logs.getFinishedLogRecords();
		expect(records.map((record) => record.body)).toEqual([
			"shape request",
			"shape request",
		]);
		expect(
			records.map((record) => record.attributes["stellarc.shape.log"]),
		).toEqual(["full", "changes_only"]);
		expect(
			JSON.stringify(records.map((record) => record.attributes)),
		).not.toContain("private-request-value");
	} finally {
		await runtime.dispose();
		await sql.end();
	}
});

test("Biome forbids console in services but preserves frozen UI and test overrides", () => {
	for (const [path, denied] of [
		["apps/stellarc-api/src/http.ts", true],
		["apps/stellarc-worker/src/main.ts", true],
		["packages/telemetry/src/index.ts", true],
		["apps/stellarc-ui/src/main.tsx", false],
		["tests/unit/foundation.test.ts", false],
	] as const) {
		const root = mkdtempSync(join(tmpdir(), "stellarc-biome-"));
		try {
			copyFileSync("biome.json", join(root, "biome.json"));
			const file = join(root, path);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, 'console.info("probe");\n');
			const result = spawnSync(
				process.execPath,
				[resolve("node_modules/@biomejs/biome/bin/biome"), "lint", path],
				{ cwd: root, encoding: "utf8" },
			);
			expect(result.error).toBeUndefined();
			expect(result.status, path).toBe(denied ? 1 : 0);
			if (denied) expect(result.stderr).toContain("lint/suspicious/noConsole");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test("transaction IDs reject overflow rather than rounding", () => {
	expect(safeTxid("123")).toBe(123);
	expect(() => safeTxid("9007199254740992")).toThrow(
		"Unsupported transaction ID",
	);
	expect(() => safeTxid("0")).toThrow("Unsupported transaction ID");
});
