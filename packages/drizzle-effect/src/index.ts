/**
 * Drizzle ⇄ Effect v4 bridge (successor of @effect/sql-drizzle, which has no
 * v4 release).
 *
 * - Every drizzle QueryPromise / select builder becomes an Effect
 *   (`yield* db.select()...`) that fails with SqlError.
 * - Queries execute through `effect/sql` SqlClient, so they participate in
 *   `SqlClient.withTransaction` and emit Effect tracing spans.
 * - The fiber's Context is threaded per query (not module-global), so
 *   concurrent fibers and nested transactions each use their own connection.
 */

import type { DrizzleConfig } from "drizzle-orm";
import { PgSelectBase } from "drizzle-orm/pg-core";
import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import { QueryPromise } from "drizzle-orm/query-promise";
import { Context, Effect, Effectable, Layer } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import { SqlError, UnknownError } from "effect/sql/SqlError";

// biome-ignore lint/suspicious/noExplicitAny: fiber context bridged into the drizzle callback
let currentContext: Context.Context<any> | undefined;

const toSqlError = (cause: unknown) =>
	cause instanceof SqlError
		? cause
		: new SqlError({
				reason: new UnknownError({
					cause,
					message: "Failed to execute drizzle query",
				}),
			});

// biome-ignore lint/suspicious/noExplicitAny: prototype shared by every drizzle builder
const proto = Effectable.Prototype<Effect.Effect<any, SqlError>>({
	label: "DrizzleQuery",
	evaluate() {
		const self = this as unknown as { execute(): Promise<unknown> };
		// biome-ignore lint/suspicious/noExplicitAny: whatever the fiber carries
		return Effect.contextWith((ctx: Context.Context<any>) =>
			Effect.tryPromise({
				try: () => {
					const previous = currentContext;
					currentContext = ctx;
					try {
						// execute() synchronously reaches the remote callback, which
						// captures currentContext before the first await.
						return self.execute();
					} finally {
						currentContext = previous;
					}
				},
				catch: toSqlError,
			}),
		) as Effect.Effect<unknown, SqlError>;
	},
});

const patch = (prototype: object) => {
	if (Effect.TypeId in prototype) return;
	for (const key of Reflect.ownKeys(proto)) {
		if (key === "constructor") continue;
		Object.defineProperty(
			prototype,
			key,
			Object.getOwnPropertyDescriptor(proto, key) as PropertyDescriptor,
		);
	}
};
patch(QueryPromise.prototype);
patch(PgSelectBase.prototype);

declare module "drizzle-orm" {
	interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}
declare module "drizzle-orm/pg-core" {
	// biome-ignore lint/suspicious/noExplicitAny: mirrors drizzle's generic arity
	interface PgSelectBase<
		TTableName,
		TSelection,
		TSelectMode,
		TNullabilityMap,
		TDynamic,
		TExcludedMethods,
		TResult extends any[],
		TSelectedFields,
	> extends Effect.Effect<TResult, SqlError> {}
}

const makeRemoteCallback = Effect.gen(function* () {
	const client = yield* SqlClient;
	const construction = yield* Effect.context<never>();
	return (sql: string, params: Array<unknown>, method: string) => {
		const ctx = currentContext ?? construction;
		const statement = client.unsafe(sql, params);
		const run = (effect: Effect.Effect<unknown, SqlError>) =>
			Effect.runPromiseWith(ctx)(effect);
		if (method === "execute")
			return run(Effect.map(statement.raw, (header) => ({ rows: [header] })));
		let effect: Effect.Effect<unknown, SqlError> =
			method === "all" || method === "values"
				? statement.values
				: statement.withoutTransform;
		if (method === "get")
			effect = Effect.map(
				effect as Effect.Effect<ReadonlyArray<unknown>, SqlError>,
				(rows) => rows[0] ?? [],
			);
		return run(Effect.map(effect, (rows) => ({ rows }))) as Promise<{
			rows: Array<unknown>;
		}>;
	};
});

export const make = <TSchema extends Record<string, unknown>>(
	config?: Omit<DrizzleConfig<TSchema>, "logger">,
) =>
	Effect.map(makeRemoteCallback, (callback) =>
		drizzle(callback as never, config),
	) as Effect.Effect<PgRemoteDatabase<TSchema>, never, SqlClient>;

export class PgDrizzle extends Context.Service<
	PgDrizzle,
	PgRemoteDatabase<Record<string, never>>
>()("stellarc/drizzle-effect/PgDrizzle") {
	static readonly layer = Layer.effect(PgDrizzle, make());
}
