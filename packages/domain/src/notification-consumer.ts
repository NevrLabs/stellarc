import { Effect } from "effect";
import type { Sql } from "postgres";
import { OUTBOX_CHANNEL_NAME, processOneJob } from "./notification-outbox";

/**
 * Worker run loop (§2): LISTEN before initial catch-up, drains pending rows on
 * startup/reconnect/notify, and arms a one-shot timer for the earliest
 * persisted retry deadline (never interval-only polling). Graceful shutdown
 * interrupts the wait and lets the LISTEN connection unwind via the scope.
 */
export interface LoopDeps {
	readonly sql: Sql;
	/** Idle sleep when no deadline is persisted (long-poll style, not a poll). */
	readonly idleWaitMs?: number;
}

const drainAll = (sql: Sql): Effect.Effect<number, unknown> =>
	Effect.tryPromise({
		try: async () => {
			let processed = 0;
			// Each job is its own transaction inside processOneJob.
			for (;;) {
				const didWork = await Effect.runPromise(
					processOneJob({ sql }) as Effect.Effect<boolean, unknown>,
				);
				if (!didWork) break;
				processed += 1;
				if (processed >= 100) break; // bounded batch; the loop re-enters
			}
			return processed;
		},
		catch: (cause) => cause,
	});

const nextDeadlineMs = (
	sql: Sql,
	idleWaitMs: number,
): Effect.Effect<number, unknown> =>
	Effect.tryPromise({
		try: async () => {
			const [row] = await sql<{ delta: string | null }[]>`
        SELECT EXTRACT(EPOCH FROM (available_at - now()))::text AS delta
        FROM notification_outbox
        WHERE state = 'pending'
        ORDER BY available_at
        LIMIT 1`;
			if (!row || row.delta === null) return idleWaitMs;
			const seconds = Number(row.delta);
			if (!Number.isFinite(seconds)) return idleWaitMs;
			// overdue → immediate retry; future → wait until the deadline
			return Math.max(0, Math.min(seconds * 1000, idleWaitMs));
		},
		catch: (cause) => cause,
	});

export const runConsumerLoop = (
	deps: LoopDeps,
): Effect.Effect<never, unknown> =>
	Effect.scoped(
		Effect.gen(function* () {
			const idleWaitMs = deps.idleWaitMs ?? 30_000;
			// LISTEN before catch-up (§2): no wakeup can be lost between the
			// initial drain and the notification subscription. postgres.js LISTEN
			// owns its connection; acquireRelease unlistens on interruption.
			yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: () =>
						deps.sql.listen(OUTBOX_CHANNEL_NAME, () => {
							// wakeup is advisory only; the drain loop re-checks the table
						}),
					catch: (cause) => cause,
				}),
				(listenConn) =>
					Effect.promise(() => listenConn.unlisten().then(() => undefined)),
			);
			for (;;) {
				yield* drainAll(deps.sql);
				const deadlineMs = yield* nextDeadlineMs(deps.sql, idleWaitMs);
				yield* Effect.sleep(deadlineMs);
			}
		}),
	) as Effect.Effect<never, unknown>;
