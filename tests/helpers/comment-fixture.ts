import { Cause, type Effect, Exit, ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import { migrate } from "../../packages/db/src/migrate";
import type { Actor } from "../../packages/domain/src/activity";
import { TelemetryTest } from "../../packages/telemetry/src/index";
import { seedIdentity } from "./activity-fixture";
import { disposablePostgres } from "./postgres";

/**
 * T02/T03 isolated fixture: disposable PG + migrated schema + identity seed +
 * in-memory ticket/outbox seams. No fake production ticket tables — the
 * TicketScopeResolver here IS the seam implementation under test.
 */
export async function makeCommentFixture() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	const org = "org-fix-1";
	const alice: Actor = { principalId: "agent-1", userId: "user-alice" };
	const bob: Actor = { principalId: "user-bob", userId: "user-bob" };
	const outsider: Actor = { principalId: "user-zed", userId: "user-zed" };
	const viewer: Actor = { principalId: "user-carol", userId: "user-carol" };
	await seedIdentity(sql, {
		org,
		users: ["user-alice", "user-bob", "user-carol"],
	});

	const boardId = "board-fix-1";
	const ticketId = "task-fix-1";
	// Actor→permission matrix owned by the fixture (STL-16 owns the real one).
	const viewers = new Set(["user-alice", "user-bob", "user-carol"]);
	const updaters = new Set(["user-alice", "user-bob"]);
	const tickets = {
		resolve: async (orgArg: string, id: string, actor: Actor) => {
			if (orgArg !== org || id !== ticketId) return null;
			if (!viewers.has(actor.userId)) return null;
			return {
				ticketId: id,
				boardId,
				assigneeUserId: "user-bob",
				canUpdate: updaters.has(actor.userId),
				canView: true,
			};
		},
	};

	let enqueueCalls = 0;
	const outbox = {
		enqueueInTx: async (
			tx: Sql,
			orgArg: string,
			eventSeq: bigint,
			traceparent: string | null,
		) => {
			enqueueCalls += 1;
			await tx`INSERT INTO notification_outbox (id,org_id,event_seq,consumer,traceparent)
        VALUES (${crypto.randomUUID()},${orgArg},${eventSeq.toString()},'inbox-v1',${traceparent})`;
		},
	};
	const failingOutbox = {
		enqueueInTx: async () => {
			throw new Error("forced enqueue failure");
		},
	};

	const parseMentions = (content: string): string[] => {
		const ids = new Set<string>();
		const re = /<kaneo-mention[^>]*\bid="([^"]+)"/gi;
		for (let m = re.exec(content); m !== null; m = re.exec(content))
			if (m[1]) ids.add(m[1]);
		return [...ids];
	};

	// Event-time candidate resolution: assignee + historical participants from
	// the projection, membership-rechecked, actor excluded (§2).
	const resolveRecipients = async (args: {
		tx: Sql;
		scope: { assigneeUserId: string | null };
		actor: Actor;
		mentions: string[];
	}) => {
		const participants = await args.tx`
      SELECT DISTINCT user_id FROM activity_projection
      WHERE org_id=${org} AND ticket_id=${ticketId} AND user_id IS NOT NULL`;
		const candidates = new Set<string>([
			...(args.scope.assigneeUserId ? [args.scope.assigneeUserId] : []),
			...participants.map((p) => p.user_id as string),
			...args.mentions,
		]);
		candidates.delete(args.actor.userId);
		const members = await args.tx`
      SELECT user_id FROM organization_member WHERE organization_id=${org}`;
		const memberSet = new Set(members.map((m) => m.user_id as string));
		return [...candidates].filter((c) => memberSet.has(c));
	};

	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);

	async function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
		// runPromiseExit + squash keeps the original error identity (Fail error
		// or Die defect) so tests can assert the domain error class.
		const exit = await runtime.runPromiseExit(
			effect as Effect.Effect<A, unknown>,
		);
		if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
		return exit.value;
	}

	// Sabotage variant: identical mutation with the enqueue step removed —
	// proves the test can detect a missing job (the negative-control assertion
	// below must FAIL while this variant "succeeds").
	async function runSabotagedEnqueue(): Promise<boolean> {
		await sql.begin(async (tx) => {
			const now = new Date();
			await tx`INSERT INTO comment (id,org_id,ticket_id,type,created_at,updated_at,user_id,content,edit_history)
        VALUES (${crypto.randomUUID()},${org},${ticketId},'comment',${now},${now},'user-alice','sabotaged',${tx.json([])})`;
		});
		return true;
	}

	const spans = () =>
		telemetry.spans.getFinishedSpans().map((s) => ({
			name: s.name,
			attributes: s.attributes,
		}));

	return {
		sql,
		close: async () => {
			await runtime.dispose();
			await db.close();
		},
		org,
		boardId,
		ticketId,
		alice,
		bob,
		outsider,
		viewer,
		tickets,
		outbox,
		failingOutbox,
		parseMentions,
		resolveRecipients,
		run,
		runSabotagedEnqueue,
		spans,
		get enqueueCalls() {
			return enqueueCalls;
		},
	};
}
