/**
 * Kaneo-compatible domain, hosted by the Effect runtime.
 *
 * The route tree and handlers are the lifted Kaneo API (packages/kaneo-legacy).
 * Everything around them is Effect: resources are acquired/released by this
 * Layer (startup migrations + seeds, scheduler, WS adapter, event bus, Redis,
 * PG pool), each request runs inside an Effect span, and shutdown is fiber
 * interruption — not process.on handlers.
 */
import { Context, Effect, Layer } from "effect";

export interface FetchApp {
	readonly fetch: (
		request: Request,
		env?: unknown,
	) => Response | Promise<Response>;
}

export interface KaneoDomainService {
	/** Lifted legacy Hono app (fallback for not-yet-migrated endpoints). */
	readonly legacy: FetchApp;
	/** BetterAuth-backed principal resolution shared with native handlers. */
	readonly resolvePrincipal: (headers: Headers) => Promise<
		| {
				userId: string;
				userRole: string | null;
				apiKey: {
					id: string;
					permissions: Record<string, string[]> | null;
					metadata: Record<string, unknown> | null;
				} | null;
		  }
		| null
		| "malformed"
	>;
}

export class KaneoDomain extends Context.Tag("stellarc/KaneoDomain")<
	KaneoDomain,
	KaneoDomainService
>() {}

/** The legacy tree is type-checked by its own config (packages/kaneo-legacy
 * keeps Kaneo's looser settings). Here it is loaded by path through a narrow
 * structural contract, so the strict root typecheck never crawls into it. */
const LEGACY = "../../../packages/kaneo-legacy/src";
// biome-ignore lint/suspicious/noExplicitAny: boundary into the untyped legacy tree
const load = (path: string): Effect.Effect<any, unknown> =>
	Effect.tryPromise({
		try: () => import(`${LEGACY}/${path}`),
		catch: (cause) => cause,
	});

export const KaneoDomainLive = Layer.scoped(
	KaneoDomain,
	Effect.gen(function* () {
		const legacy = yield* load("index.ts");
		const scheduler = yield* load("scheduler/index.ts");
		const ws = yield* load("ws/index.ts");
		const database = yield* load("database/index.ts");
		const redis = yield* load("redis/index.ts");
		const events = yield* load("events/index.ts");
		yield* Effect.acquireRelease(
			Effect.tryPromise({
				try: () => legacy.runStartupTasks(),
				catch: (cause) => cause,
			}).pipe(
				Effect.withSpan("kaneo.startup"),
				Effect.zipRight(Effect.logInfo("kaneo domain started")),
			),
			() =>
				Effect.gen(function* () {
					yield* Effect.sync(() => scheduler.shutdownScheduler());
					yield* Effect.promise(() =>
						ws.shutdownWebSocketAdapter().catch(() => {}),
					);
					yield* Effect.promise(() =>
						events.shutdownEventBus().catch(() => {}),
					);
					yield* Effect.promise(() => redis.closeRedis().catch(() => {}));
					yield* Effect.promise(() =>
						database
							.getDatabasePool()
							.end()
							.catch(() => {}),
					);
					yield* Effect.logInfo("kaneo domain stopped");
				}).pipe(Effect.withSpan("kaneo.shutdown")),
		);
		const auth = yield* load("stellarc-auth.ts");
		return {
			legacy: legacy.default as FetchApp,
			resolvePrincipal: auth.resolvePrincipal,
		};
	}),
);
