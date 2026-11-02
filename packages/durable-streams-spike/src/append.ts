import { Effect } from "effect";
import type { Sql } from "postgres";

/**
 * NEVR-438 spike fixture: appends agent-session events through the SAME
 * transactional pattern as packages/domain runMutations — the per-org
 * org_event_counter is advanced inside the write tx (commit-ordered cursor,
 * ADR 0007 contract 1) and the event carries the committing txid.
 *
 * The spike server never writes; this is the "injection system" the read
 * path serves (docs/building-a-server.md).
 */

export interface SessionMessage {
	role: "user" | "assistant" | "tool";
	content: string;
}

export interface AppendResult {
	txid: string;
	seqs: string[];
}

export const appendSessionEvents = Effect.fn(
	"DurableStreams.appendSessionEvents",
)(
	(
		sql: Sql,
		org: string,
		actor: string,
		sessionId: string,
		messages: readonly SessionMessage[],
	): Effect.Effect<AppendResult, unknown> =>
		Effect.tryPromise({
			try: () => appendSessionEventsRun(sql, org, actor, sessionId, messages),
			catch: (cause) => cause,
		}),
);

export async function appendSessionEventsRun(
	sql: Sql,
	org: string,
	actor: string,
	sessionId: string,
	messages: readonly SessionMessage[],
): Promise<AppendResult> {
	if (messages.length === 0) throw new Error("empty append");
	return sql.begin(async (tx) => {
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`UPDATE org_event_counter SET seq=seq+${messages.length} WHERE org=${org} RETURNING seq::text`;
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		let seq = BigInt(counter.seq) - BigInt(messages.length);
		const seqs: string[] = [];
		for (const message of messages) {
			seq += 1n;
			seqs.push(seq.toString());
			await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
				VALUES (${org},${seq.toString()},'agent.session.message',${actor},
					${tx.json({ sessionId, role: message.role, content: message.content })},
					1,${transaction.txid})`;
		}
		return { txid: transaction.txid, seqs };
	});
}
