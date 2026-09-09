import { Schema } from "effect";
import type { Sql } from "postgres";

export const Probe = Schema.Struct({
	id: Schema.NonEmptyString,
	value: Schema.String,
});
export function safeTxid(value: string): number {
	const id = BigInt(value);
	if (id <= 0n || id > BigInt(Number.MAX_SAFE_INTEGER))
		throw new Error("Unsupported transaction ID");
	return Number(id);
}
export async function writeProbe(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	value: string,
) {
	return mutateProbes(sql, org, actor, [{ operation: "upsert", id, value }]);
}

export type ProbeMutation =
	| { operation: "upsert"; id: string; value: string }
	| { operation: "delete"; id: string };

export async function mutateProbes(
	sql: Sql,
	org: string,
	actor: string,
	mutations: readonly ProbeMutation[],
) {
	if (!org || !actor || mutations.length === 0)
		throw new Error("Invalid principal or empty mutation");
	for (const mutation of mutations) {
		Schema.decodeUnknownSync(Schema.NonEmptyString)(mutation.id);
		if (mutation.operation === "upsert")
			Schema.decodeUnknownSync(Probe)(mutation);
	}
	return sql.begin(async (tx) => {
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`UPDATE org_event_counter SET seq=seq+${mutations.length} WHERE org=${org} RETURNING seq::text`;
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		const txid = safeTxid(transaction.txid);
		let seq = BigInt(counter.seq) - BigInt(mutations.length);
		for (const mutation of mutations) {
			seq += 1n;
			const { id } = mutation;
			if (mutation.operation === "delete") {
				const rows =
					await tx`SELECT id FROM sync_probe WHERE org=${org} AND id=${id}`;
				if (rows.length === 0) throw new Error("Probe not found");
			}
			const payload =
				mutation.operation === "upsert"
					? { id, value: mutation.value }
					: { id };
			const pluginType =
				mutation.operation === "upsert"
					? "foundation:probe-upserted"
					: "foundation:probe-deleted";
			await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
      VALUES (${org},${seq.toString()},${pluginType},${actor},${tx.json(payload)},1,${transaction.txid})`;
			if (mutation.operation === "upsert") {
				await tx`INSERT INTO sync_probe(org,id,value,last_seq) VALUES (${org},${id},${mutation.value},${seq.toString()})
      ON CONFLICT (org,id) DO UPDATE SET value=EXCLUDED.value,last_seq=EXCLUDED.last_seq`;
			} else {
				await tx`DELETE FROM sync_probe WHERE org=${org} AND id=${id}`;
			}
		}
		return { txid };
	});
}

export async function deleteProbe(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	if (!org || !actor || !id) throw new Error("Invalid principal or probe ID");
	return sql.begin(async (tx) => {
		const [existing] =
			await tx`SELECT id FROM sync_probe WHERE org=${org} AND id=${id} FOR UPDATE`;
		if (!existing) throw new Error("NotFound");
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org=${org} RETURNING seq::text`;
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		const txid = safeTxid(transaction.txid);
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
			VALUES (${org},${counter.seq},'foundation:probe-deleted',${actor},${tx.json({ id })},1,${transaction.txid})`;
		await tx`DELETE FROM sync_probe WHERE org=${org} AND id=${id}`;
		return { txid };
	});
}
