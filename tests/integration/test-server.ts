import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpServer,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { errorResponse } from "../../apps/stellarc-api/src/errors";
import { migrate } from "../../packages/db/src/migrate";
import {
	deleteProbeEffect,
	writeProbeEffect,
} from "../../packages/domain/src/index";
import { TelemetryTest } from "../../packages/telemetry/src/index";
import { ShapeEngine } from "../../packages/sync/src/index";
import { disposablePostgres } from "../helpers/postgres";
export async function startTestServer() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const engine = new ShapeEngine(db.sql);
	// Fixture mutations run through a telemetry runtime so the append spans the
	// domain service emits actually export — the same trace accounting tests
	// assert on. The foundation server receives this layer too, so handler-run
	// mutations share it. A single memo map is shared by every build of the
	// layer (runtime + both web handlers): OTel metric readers refuse a second
	// MeterProvider binding, so each build must reuse one instance.
	const telemetry = TelemetryTest();
	const memoMap = await Effect.runPromise(Layer.makeMemoMap);
	const runtime = ManagedRuntime.make(telemetry.layer, memoMap);
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const http = foundationHandler(
		db.sql,
		engine,
		(org, headers) => {
			if (!headers.authorization) return "unauthenticated";
			return headers.authorization === `Bearer ${org}` ? "ok" : "forbidden";
		},
		undefined,
		telemetry.layer,
		memoMap,
	);
	const id = Schema.NonEmptyString.pipe(Schema.maxLength(128));
	const api = HttpApi.make("fixtures").add(
		HttpApiGroup.make("probes")
			.add(
				HttpApiEndpoint.post("write", "/orgs/:org/__test/probes").setPath(
					Schema.Struct({ org: id }),
				),
			)
			.add(
				HttpApiEndpoint.del("delete", "/orgs/:org/__test/probes/:id").setPath(
					Schema.Struct({ org: id, id }),
				),
			),
	);
	const reply = (status: number, _tag: string, message: string) =>
		HttpServerResponse.unsafeJson({ _tag, message }, { status });
	const fixtureGroup = HttpApiBuilder.group(api, "probes", (handlers) =>
		handlers
			.handleRaw("write", ({ path, request }) =>
				Effect.tryPromise({
					try: async () => {
						if (!request.headers.authorization)
							return reply(401, "Unauthenticated", "Authentication required");
						if (request.headers.authorization !== `Bearer ${path.org}`)
							return reply(403, "Forbidden", "Access denied");
						const body = await Effect.runPromise(request.json).catch(
							() => null,
						);
						const decoded = Schema.decodeUnknownOption(
							Schema.Struct({ id, value: Schema.String }),
						)(body);
						if (decoded._tag === "None")
							return reply(400, "BadRequest", "Invalid request");
						return HttpServerResponse.unsafeJson(
							await runtime.runPromise(
								writeProbeEffect(
									db.sql,
									path.org,
									"test-actor",
									decoded.value.id,
									decoded.value.value,
								),
							),
						);
					},
					catch: errorResponse,
				}).pipe(Effect.catchAll(Effect.succeed)),
			)
			.handleRaw("delete", ({ path, request }) =>
				Effect.tryPromise({
					try: async () => {
						if (!request.headers.authorization)
							return reply(401, "Unauthenticated", "Authentication required");
						if (request.headers.authorization !== `Bearer ${path.org}`)
							return reply(403, "Forbidden", "Access denied");
						try {
							return HttpServerResponse.unsafeJson(
								await runtime.runPromise(
									deleteProbeEffect(db.sql, path.org, "test-actor", path.id),
								),
							);
						} catch (error) {
							if (error instanceof Error && error.message === "NotFound")
								return reply(404, "NotFound", "Probe not found");
							throw error;
						}
					},
					catch: errorResponse,
				}).pipe(Effect.catchAll(Effect.succeed)),
			),
	);
	const fixtures = HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(api).pipe(Layer.provide(fixtureGroup)),
			HttpServer.layerContext,
			telemetry.layer,
		),
		{ memoMap },
	);
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: (request) =>
			new URL(request.url).pathname.includes("/__test/")
				? fixtures.handler(request)
				: http.handler(request),
	});
	return {
		url: server.url.origin,
		telemetry,
		get afterProjectionRead() {
			return engine.afterProjectionRead;
		},
		set afterProjectionRead(value: (() => Promise<void>) | undefined) {
			engine.afterProjectionRead = value;
		},
		write: (org: string, id: string, value: string) =>
			runtime.runPromise(
				writeProbeEffect(db.sql, org, "test-actor", id, value),
			),
		delete: (org: string, id: string) =>
			runtime.runPromise(deleteProbeEffect(db.sql, org, "test-actor", id)),
		async eventCount(org: string) {
			const [row] =
				await db.sql`SELECT count(*)::int AS count FROM event WHERE org=${org}`;
			return row.count as number;
		},
		async close() {
			server.stop(true);
			await fixtures.dispose();
			await http.dispose();
			await runtime.dispose();
			await db.close();
		},
	};
}
