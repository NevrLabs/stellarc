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
	Schema.decodeUnknownSync(Probe)({ id, value });
	if (!org || !actor) throw new Error("Invalid principal");
	return sql.begin(async (tx) => {
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org=${org} RETURNING seq::text`;
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		const txid = safeTxid(transaction.txid);
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
      VALUES (${org},${counter.seq},'foundation:probe-upserted',${actor},${tx.json({ id, value })},1,${transaction.txid})`;
		await tx`INSERT INTO sync_probe(org,id,value,last_seq) VALUES (${org},${id},${value},${counter.seq})
      ON CONFLICT (org,id) DO UPDATE SET value=EXCLUDED.value,last_seq=EXCLUDED.last_seq`;
		return { txid };
	});
}
