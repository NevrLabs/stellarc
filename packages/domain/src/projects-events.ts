import { Effect, Runtime, Schema } from "effect";
import type { Sql } from "postgres";
import { ProjectEventPayloadSchemas } from "../../contracts/src/projects";
import type { UpcasterRegistry } from "../../sync/src/upcasters";

/** Registers the 14 project event types (schema_version 1) on the sync engine’s
 * upcaster registry. Live events decode through the contract payload schemas;
 * unknown versions fail closed (UnsupportedEventSchema). */
export function registerProjectsUpcasters(registry: UpcasterRegistry): void {
	for (const [type, schema] of Object.entries(ProjectEventPayloadSchemas)) {
		registry.registerType(type, (payload) =>
			Schema.decodeUnknownSync(
				schema as Schema.Schema<unknown, unknown, never>,
			)(payload),
		);
	}
}

// --- Shared instrumented event appender (ADR 0010; review-4 defect 8) --------
// Single copy of the event INSERT: a stellarc.event.append span annotated with
// type/seq/txid, mirroring ./index.ts's appender. Services thread the runtime
// captured by their Effect.fn span so the append joins that trace; the plain
// runtime fallback keeps non-Effect callers exporting via the global tracer.
export const appendProjectEventSpan = Effect.fn("stellarc.event.append")(
	function* (
		write: () => PromiseLike<unknown>,
		type: string,
		seq: string,
		txid: number,
	) {
		yield* Effect.annotateCurrentSpan({
			"stellarc.event.type": type,
			"stellarc.event.seq": seq,
			"stellarc.event.txid": txid,
		});
		yield* Effect.tryPromise({
			try: () => Promise.resolve(write()),
			catch: (cause) => cause,
		});
	},
);

export async function appendProjectEventEffect(
	tx: Sql,
	org: string,
	actor: string,
	type: string,
	payload: Record<string, unknown>,
	runtime?: Runtime.Runtime<never>,
): Promise<void> {
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text`;
	const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	const txid = Number(BigInt(transaction.txid));
	const seq = counter.seq as string;
	const write = () =>
		tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
			VALUES (${org}, ${seq}, ${type}, ${actor}, ${tx.json(payload as never)}, 1, ${transaction.txid})`;
	if (runtime)
		await Runtime.runPromise(runtime)(
			appendProjectEventSpan(write, type, seq, txid),
		);
	else await Effect.runPromise(appendProjectEventSpan(write, type, seq, txid));
}

// Effect.fn service scaffolding: every exported project service is an
// Effect.fn("<Module>.<name>") span; the captured runtime threads into the
// operation so nested event-append spans join the caller's trace (pattern:
// Domain.mutateProbesEffect in ./index.ts).
export function opService<const Name extends string, A extends unknown[], R>(
	name: Name,
	op: (runtime: Runtime.Runtime<never>, ...args: A) => Promise<R>,
) {
	return Effect.fn(name)(function* (...args: A) {
		const runtime = yield* Effect.runtime<never>();
		return yield* Effect.tryPromise({
			try: () => op(runtime, ...args),
			catch: (cause) => cause as Error,
		});
	});
}
