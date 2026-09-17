import type { Sql } from "postgres";
import { migrate } from "../../packages/db/src/migrate";
import { seedIdentity } from "./activity-fixture";
import { disposablePostgres } from "./postgres";

type EventHandle = {
	org: string;
	seq: string;
};

/**
 * T05–T08/T10/T17 worker fixture: disposable PG, identity seed, a board-less
 * comment-created event planted directly in the event log, and two SEPARATE
 * pooled connections to exercise SKIP LOCKED races for real.
 */
export async function makeWorkerFixture() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	const org = "org-wfix-1";
	await seedIdentity(sql, {
		org,
		users: ["user-alice", "user-bob", "user-carol"],
	});

	async function plantEvent(
		pluginType: string,
		payload: string,
	): Promise<EventHandle> {
		// Derive the seq from the counter table (worker events advance it too).
		await sql`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [row] = await sql<{ seq: string }[]>`
      UPDATE org_event_counter SET seq=seq+1 WHERE org=${org} RETURNING seq::text AS seq`;
		const [txrow] = await sql`SELECT pg_current_xact_id()::text AS txid`;
		await sql`INSERT INTO event (org,seq,plugin_type,actor,payload,schema_version,txid)
      VALUES (${org},${row.seq},${pluginType},'user-alice',${payload},1,${txrow.txid})`;
		return { org, seq: row.seq };
	}

	async function enqueueJob(eventHandle: EventHandle): Promise<string> {
		const id = crypto.randomUUID();
		await sql`INSERT INTO notification_outbox (id,org_id,event_seq,consumer,state)
      VALUES (${id},${org},${eventHandle.seq},'inbox-v1','pending')`;
		return id;
	}

	async function enqueueCommentCreatedJob(args: {
		recipients: string[];
	}): Promise<string> {
		const eventHandle = await plantEvent(
			"activity:comment-created",
			JSON.stringify({
				id: crypto.randomUUID(),
				ticketId: "task-wfix-1",
				boardId: "board-wfix-1",
				row: { content: "worker fixture comment" },
				origin: "live",
				mentionUserIds: [],
				recipientUserIds: args.recipients,
			}),
		);
		return enqueueJob(eventHandle);
	}

	/** T17: a second job for the same (org,event_seq,consumer) must be refused. */
	async function enqueueSameEventAgain(jobId: string): Promise<string> {
		const [row] = await sql<{ org_id: string; event_seq: string }[]>`
      SELECT org_id, event_seq::text FROM notification_outbox WHERE id=${jobId}`;
		if (!row) throw new Error("job missing");
		const dup = crypto.randomUUID();
		await sql`INSERT INTO notification_outbox (id,org_id,event_seq,consumer,state)
      VALUES (${dup},${row.org_id},${row.event_seq},'inbox-v1','pending')`;
		return dup;
	}

	async function enqueueCorruptJob(): Promise<string> {
		const eventHandle = await plantEvent(
			"activity:comment-created",
			JSON.stringify({ origin: "import", garbage: true }),
		);
		return enqueueJob(eventHandle);
	}

	async function jobState(jobId: string): Promise<string | null> {
		const rows =
			await sql`SELECT state FROM notification_outbox WHERE id=${jobId}`;
		return rows[0]?.state ?? null;
	}

	async function attempts(jobId: string): Promise<number> {
		const rows =
			await sql`SELECT attempts FROM notification_outbox WHERE id=${jobId}`;
		return rows[0] ? Number(rows[0].attempts) : 0;
	}

	async function lastErrorCode(jobId: string): Promise<string | null> {
		const rows =
			await sql`SELECT last_error_code FROM notification_outbox WHERE id=${jobId}`;
		return rows[0]?.last_error_code ?? null;
	}

	async function countNotifications(): Promise<number> {
		const rows = await sql`SELECT count(*)::int AS n FROM notification`;
		return rows[0].n as number;
	}

	// T05 crash simulation: hold the job's row lock on a connection that is
	// killed without committing, then verify nothing survived.
	async function simulateCrashDuringProcessing(jobId: string): Promise<void> {
		const crashSql = db.connect({ max: 1 });
		try {
			await crashSql.begin(async (tx) => {
				await tx`SELECT 1 FROM notification_outbox WHERE id=${jobId} FOR UPDATE`;
				await crashSql.end({ timeout: 0 });
			});
		} catch {
			// expected: connection destroyed mid-transaction
		}
	}

	// second/third pooled connections for concurrency tests
	const sqlA: Sql = db.connect({ max: 2 });
	const sqlB: Sql = db.connect({ max: 2 });

	async function runtime() {
		const { ManagedRuntime } = await import("effect");
		const { Layer } = await import("effect");
		if (!runtimeRef.current) {
			runtimeRef.current = ManagedRuntime.make(Layer.empty);
		}
		return runtimeRef.current;
	}

	async function run<A>(
		effect: import("effect").Effect.Effect<A, unknown>,
	): Promise<A> {
		const { Exit, Cause } = await import("effect");
		const rt = await runtime();
		const exit = await rt.runPromiseExit(effect);
		if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
		return exit.value;
	}

	/** Fork a long-running effect (consumer loop) for later interrupt. */
	async function runFork(
		effect: import("effect").Effect.Effect<unknown, unknown>,
	): Promise<{ interrupt(): Promise<void> }> {
		const { Effect } = await import("effect");
		const rt = await runtime();
		const fiber = rt.runFork(effect);
		return {
			interrupt: async () => {
				const { Fiber, FiberId } = await import("effect");
				await Effect.runPromise(
					Fiber.interruptAsFork(FiberId.none)(fiber as never),
				).catch(() => undefined);
			},
		};
	}

	async function sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function waitFor(
		predicate: () => Promise<boolean>,
		timeoutMs: number,
	): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			if (await predicate()) return;
			if (Date.now() >= deadline) throw new Error("waitFor timed out");
			await sleep(25);
		}
	}
	const runtimeRef: {
		current:
			| import("effect").ManagedRuntime.ManagedRuntime<never, never>
			| null;
	} = {
		current: null,
	};

	return {
		sql,
		sqlA,
		sqlB,
		close: async () => {
			await sqlA.end();
			await sqlB.end();
			await db.close();
		},
		org,
		enqueueCommentCreatedJob,
		enqueueCorruptJob,
		enqueueSameEventAgain,
		jobState,
		attempts,
		lastErrorCode,
		countNotifications,
		simulateCrashDuringProcessing,
		run,
		runFork,
		sleep,
		waitFor,
	};
}
