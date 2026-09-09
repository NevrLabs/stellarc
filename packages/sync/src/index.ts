import type { Sql } from "postgres";
import { electricSchema, key, type ProbeRow } from "../../contracts/src/shape";

export class ShapeEngine {
	afterProjectionRead?: () => Promise<void>;
	private snapshots = new Map<
		string,
		{ org: string; rows: ProbeRow[]; boundary: string; expires: number }
	>();
	constructor(private sql: Sql) {}
	async shape(org: string, url: URL): Promise<Response> {
		const q = url.searchParams;
		const allowed = new Set([
			"table",
			"offset",
			"handle",
			"live",
			"log",
			"cursor",
			"expired_handle",
			"cache-buster",
		]);
		if ([...q.keys()].some((k) => !allowed.has(k)))
			return new Response(null, { status: 400 });
		if (q.get("table") !== "sync_probe")
			return new Response(null, { status: 404 });
		if (q.has("log") && !["full", "changes_only"].includes(q.get("log")!))
			return new Response(null, { status: 400 });
		const offset = q.get("offset");
		if (!offset) return new Response(null, { status: 400 });
		let handle = q.get("handle") ?? "";
		if (offset === "-1") {
			const snapshot = await this.sql.begin(
				"isolation level repeatable read",
				async (tx) => {
					const rows = await tx<
						ProbeRow[]
					>`SELECT org,id,value,last_seq::text FROM sync_probe WHERE org=${org} ORDER BY id`;
					await this.afterProjectionRead?.();
					const [counter] =
						await tx`SELECT seq::text FROM org_event_counter WHERE org=${org}`;
					return {
						org,
						rows: [...rows],
						boundary: counter?.seq ?? "0",
						expires: Date.now() + 300000,
					};
				},
			);
			handle = crypto.randomUUID();
			this.snapshots.set(handle, snapshot);
		}
		const snapshot = this.snapshots.get(handle);
		const headers = new Headers({
			"content-type": "application/json",
			"electric-schema": JSON.stringify(electricSchema),
			"cache-control": "no-store",
			"electric-handle": handle,
		});
		if (!snapshot || snapshot.org !== org || snapshot.expires < Date.now())
			return Response.json([{ headers: { control: "must-refetch" } }], {
				status: 409,
				headers,
			});
		const messages: unknown[] = [];
		let next: string;
		if (offset === "-1" || offset.startsWith("s:")) {
			const index = offset === "-1" ? 0 : Number(offset.slice(2));
			const rows = snapshot.rows.slice(index, index + 100);
			for (const row of rows)
				messages.push({
					key: key(org, row.id),
					value: row,
					headers: { operation: "insert", relation: ["public", "sync_probe"] },
				});
			next =
				index + 100 < snapshot.rows.length
					? `s:${index + 100}`
					: `${snapshot.boundary}_0`;
		} else {
			if (!/^\d+_0$/.test(offset)) return new Response(null, { status: 400 });
			const events = await this
				.sql`SELECT seq::text,txid::text,plugin_type,payload FROM event WHERE org=${org} AND seq>${offset.split("_")[0]!} ORDER BY seq LIMIT 100`;
			next = offset;
			for (const event of events) {
				next = `${event.seq}_0`;
				const deleted = event.plugin_type === "foundation:probe-deleted";
				messages.push({
					key: key(org, event.payload.id),
					value: deleted
						? { org, id: event.payload.id }
						: { org, ...event.payload, last_seq: event.seq },
					headers: {
						operation: deleted ? "delete" : "update",
						relation: ["public", "sync_probe"],
						txids: [Number(event.txid)],
					},
				});
			}
		}
		if (!next.startsWith("s:")) {
			messages.push({ headers: { control: "up-to-date" } });
			headers.set("electric-up-to-date", "true");
		}
		headers.set("electric-offset", next);
		return Response.json(messages, { headers });
	}
}
