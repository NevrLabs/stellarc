import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Context, Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { websocket as bunWebsocket } from "hono/bun";
import postgres from "postgres";
import {
	agentsHttp,
	staticOperatorAuth,
} from "../../../packages/agents/src/index";
import { SqlLive } from "../../../packages/db/src/index";
import { migrate } from "../../../packages/db/src/migrate";
import { Authz, AuthzLive } from "../../../packages/domain/src/authz";
import { isNative, kaneoNativeHandler } from "../../../packages/kaneo/src/http";
import { ShapeEngine } from "../../../packages/sync/src/index";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { AppConfig, ConfigLive } from "./config";
import { foundationHandler } from "./http";
import {
	KaneoDomain,
	KaneoDomainLive,
	type KaneoDomainService,
	kaneoDatabaseUrl,
} from "./kaneo";

/** Stellarc-owned tables live in their own schema so they can share a
 * database with the lifted Kaneo domain (whose `user`/`session` tables
 * would otherwise collide with identity 0002). */
const STELLARC_SCHEMA = process.env.STELLARC_DB_SCHEMA ?? "stellarc";
const kaneoEnabled = process.env.STELLARC_KANEO !== "off";

/** Native handlers sit beside the legacy CORS middleware; mirror its
 * credentialed reflection for the configured client origin(s). */
const CORS_ORIGINS = (
	process.env.CORS_ORIGINS ??
	process.env.KANEO_CLIENT_URL ??
	""
)
	.split(",")
	.map((o) => o.trim())
	.filter(Boolean);
const withCors = async (request: Request, response: Promise<Response>) => {
	const res = await response;
	const origin = request.headers.get("origin");
	const allow =
		origin &&
		(CORS_ORIGINS.length === 0
			? process.env.NODE_ENV !== "production"
			: CORS_ORIGINS.includes(origin));
	if (!allow) return res;
	const headers = new Headers(res.headers);
	headers.set("access-control-allow-origin", origin);
	headers.set("access-control-allow-credentials", "true");
	headers.append("vary", "Origin");
	return new Response(res.body, { status: res.status, headers });
};

const socketPath = (url: string) => {
	try {
		const u = new URL(url);
		const dir = u.searchParams.get("host");
		return dir?.startsWith("/")
			? { path: `${dir}/.s.PGSQL.${u.port || 5432}` }
			: {};
	} catch {
		return {};
	}
};

/** postgres.js forwards unknown query params as startup parameters. */
const withoutSocketParam = (url: string) => {
	try {
		const u = new URL(url);
		u.searchParams.delete("host");
		return u.toString();
	} catch {
		return url;
	}
};

const KANEO_PATH = /^\/api(\/|$)/;

export const api = Effect.gen(function* () {
	const config = yield* AppConfig;
	const authz = yield* Authz;
	const pg = yield* PgClient.PgClient;
	yield* pg`SELECT 1`;
	// Existing spike transactions retain their postgres.js adapter until the Effect conversion.
	if (/^[a-z_][a-z0-9_]*$/.test(STELLARC_SCHEMA) === false)
		return yield* Effect.die(new Error("Invalid STELLARC_DB_SCHEMA"));
	const sql = yield* Effect.acquireRelease(
		Effect.sync(() =>
			postgres(withoutSocketParam(Redacted.value(config.databaseUrl)), {
				max: 8,
				onnotice: () => {},
				connection: { search_path: STELLARC_SCHEMA },
				// postgres.js ignores libpq's `?host=/socket/dir`; honor it so
				// unix-socket URLs (disposable test clusters) connect as with pg.
				...socketPath(Redacted.value(config.databaseUrl)),
			}),
		),
		(sql) => Effect.promise(() => sql.end()),
	);
	yield* Effect.tryPromise({
		try: async () => {
			await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${STELLARC_SCHEMA}"`);
			await migrate(sql);
		},
		catch: (cause) =>
			new Error(
				`migration failed: ${cause instanceof Error ? cause.message : String(cause)}`,
			),
	}).pipe(Effect.withSpan("stellarc.migrate"));
	const telemetry = TelemetryLive("stellarc-api");
	const memoMap = yield* Layer.makeMemoMap;
	const http = yield* Effect.acquireRelease(
		Effect.sync(() =>
			foundationHandler(
				sql,
				new ShapeEngine(sql),
				authz.authorize,
				pg`SELECT 1`,
				telemetry,
				memoMap,
			),
		),
		(http) => Effect.promise(() => http.dispose()),
	);
	const agents = yield* Effect.acquireRelease(
		Effect.sync(() =>
			agentsHttp(sql, {
				operatorAuth: staticOperatorAuth(process.env.STELLARC_OPERATOR_TOKEN),
				telemetry,
				memoMap,
			}),
		),
		(agents) => Effect.promise(() => agents.dispose()),
	);
	// The Kaneo domain (legacy migrations, seeds, plugins, scheduler) can take
	// tens of seconds on a fresh database. It boots in a scoped background
	// fiber so /health and the foundation/agents surfaces are live at once;
	// Kaneo paths answer 503 until the domain is ready.
	type Domain = KaneoDomainService & {
		native: ReturnType<typeof kaneoNativeHandler> | null;
	};
	let kaneo: Domain | null = null;
	if (kaneoEnabled)
		yield* Effect.forkScoped(
			Effect.gen(function* () {
				const domain = yield* Layer.build(KaneoDomainLive).pipe(
					Effect.map((ctx) => Context.get(ctx, KaneoDomain)),
				);
				const native =
					process.env.STELLARC_KANEO_NATIVE !== "off"
						? yield* Effect.acquireRelease(
								Effect.sync(() =>
									kaneoNativeHandler({
										databaseUrl: kaneoDatabaseUrl(),
										resolvePrincipal: domain.resolvePrincipal,
										ports: domain.ports,
										telemetry,
										memoMap,
									}),
								),
								(h) => Effect.promise(() => h.dispose()),
							)
						: null;
				kaneo = { ...domain, native };
				yield* Effect.logInfo("kaneo ready");
				yield* Effect.never;
			}).pipe(
				Effect.scoped,
				Effect.catchAllCause((cause) =>
					Effect.logError("kaneo domain failed to start", cause),
				),
			),
		);
	const runtime = yield* Effect.acquireRelease(
		Effect.sync(() => ManagedRuntime.make(telemetry, memoMap)),
		(rt) => Effect.promise(() => rt.dispose()),
	);
	const serveKaneo = (request: Request, server: Bun.Server<unknown>) =>
		runtime.runPromise(
			Effect.tryPromise({
				try: async () =>
					(await (kaneo as Domain | null)?.legacy.fetch(request, server)) ??
					new Response("Not Found", { status: 404 }),
				catch: (cause) => cause,
			}).pipe(
				Effect.tap((response) =>
					Effect.annotateCurrentSpan(
						"http.response.status_code",
						response?.status ?? 101,
					),
				),
				Effect.catchAll((error) =>
					Effect.logError("kaneo handler failed", error).pipe(
						Effect.as(
							Response.json(
								{ message: "Internal Server Error" },
								{ status: 500 },
							),
						),
					),
				),
				Effect.withSpan("kaneo.request", {
					kind: "server",
					attributes: {
						"http.request.method": request.method,
						"url.path": new URL(request.url).pathname,
					},
				}),
			),
		);
	yield* Effect.acquireRelease(
		Effect.sync(() =>
			Bun.serve({
				port: config.port,
				// Node claims long-poll up to 30s.
				idleTimeout: 45,
				websocket: bunWebsocket,
				fetch: (request, server) => {
					if (agents.matches(request)) return agents.handler(request);
					const path = new URL(request.url).pathname;
					// Only Kaneo's own surface (/api/*) is routed to the domain;
					// everything else stays with the fail-closed foundation API.
					if (!kaneoEnabled || !KANEO_PATH.test(path))
						return http.handler(request);
					const domain = kaneo as Domain | null;
					if (!domain)
						return Response.json(
							{ message: "Starting" },
							{ status: 503, headers: { "retry-after": "2" } },
						);
					if (domain.native && isNative(request))
						return withCors(request, domain.native.handler(request));
					return serveKaneo(request, server);
				},
			}),
		),
		(server) => Effect.sync(() => server.stop(true)),
	);
	yield* Effect.logInfo("api ready");
	yield* Effect.never;
}).pipe(
	Effect.provide(SqlLive),
	Effect.provide(AuthzLive),
	Effect.provide(ConfigLive),
	Effect.scoped,
);

if (import.meta.main)
	BunRuntime.runMain(
		api.pipe(
			Effect.catchAll((error) =>
				Effect.sync(() => {
					// biome-ignore lint/suspicious/noConsole: fatal startup handler cannot depend on telemetry
					console.error(
						"API startup failed:",
						error instanceof Error ? error.message : String(error),
					);
					process.exitCode = 1;
				}),
			),
		),
	);
