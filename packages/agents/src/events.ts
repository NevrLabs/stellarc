import { Effect } from "effect";
import type { Sql, TransactionSql } from "postgres";
import { type AgentsError, isAgentsError } from "./errors";

/** Shared agents-plugin DB primitives: the org event log append (D10) and the
 * transactional-span wrapper. Kept dependency-free so store.ts and memory.ts
 * can both build on it without importing each other. */

export const PLUGIN = "agents";

/** Append events to the org log inside the caller's transaction. Returns the
 * seq range the batch occupies so callers can fold projections at the exact
 * seq of each event. */
export async function appendEvents(
	tx: TransactionSql,
	org: string,
	actor: string,
	events: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>,
): Promise<{ first: bigint; last: bigint }> {
	if (events.length === 0) return { first: 0n, last: 0n };
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq=seq+${events.length} WHERE org=${org} RETURNING seq::text`;
	const [txn] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	let seq = BigInt(counter.seq) - BigInt(events.length);
	const last = BigInt(counter.seq);
	for (const event of events) {
		seq += 1n;
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
      VALUES (${org},${seq.toString()},${`${PLUGIN}:${event.type}`},${actor},${tx.json(event.payload as never)},1,${txn.txid})`;
	}
	return { first: last - BigInt(events.length) + 1n, last };
}

/** Run a transactional body as a span; AgentsError failures pass through typed. */
export const txn = <A>(
	sql: Sql,
	name: string,
	body: (tx: TransactionSql) => Promise<A>,
): Effect.Effect<A, AgentsError | Error> =>
	Effect.tryPromise({
		try: () => sql.begin((tx) => body(tx)) as Promise<A>,
		catch: (cause) =>
			isAgentsError(cause)
				? cause
				: cause instanceof Error
					? cause
					: new Error(String(cause)),
	}).pipe(Effect.withSpan(`Agents.${name}`));
