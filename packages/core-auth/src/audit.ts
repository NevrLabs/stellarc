import type { Sql } from "postgres";
import { Denied } from "./store";

// Construct once at the candidate process root. No ordinary logger flush is an ack.
export function auditExporter(sql: Sql, endpoint: string) {
	let busy = false;
	async function exportOnce() {
		if (busy) return 0;
		busy = true;
		let accepted = 0;
		try {
			const pending =
				await sql`SELECT org,delivered::text FROM gw_audit_state WHERE seq>delivered ORDER BY org LIMIT 100`;
			for (const state of pending) {
				const events =
					await sql`SELECT * FROM gw_audit WHERE org=${state.org} AND seq>${state.delivered} ORDER BY seq LIMIT 100`;
				if (!events.length) continue;
				const records = events.map((e) => ({
					timeUnixNano: (
						BigInt(new Date(e.at).getTime()) * 1000000n
					).toString(),
					severityNumber: e.kind === "call.deny" ? 13 : 9,
					severityText: e.kind === "call.deny" ? "WARN" : "INFO",
					body: { stringValue: e.kind },
					...(e.trace ? { traceId: e.trace } : {}),
					attributes: Object.entries({
						"event.id": e.id,
						"request.id": e.request,
						"stellarc.org": e.org,
						"stellarc.actor": e.actor,
						"stellarc.subject": e.subject,
						...e.payload,
					}).map(([key, value]) => ({
						key,
						value: { stringValue: String(value) },
					})),
				}));
				const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/logs`, {
					method: "POST",
					redirect: "error",
					signal: AbortSignal.timeout(3000),
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						resourceLogs: [
							{
								resource: {
									attributes: [
										{
											key: "service.name",
											value: { stringValue: "stellarc-gateway" },
										},
										{
											key: "service.version",
											value: {
												stringValue:
													process.env.SERVICE_VERSION ?? "development",
											},
										},
										{
											key: "deployment.environment.name",
											value: { stringValue: "development" },
										},
									],
								},
								scopeLogs: [
									{
										scope: { name: "stellarc.gateway.audit" },
										logRecords: records,
									},
								],
							},
						],
					}),
				});
				if (!response.ok) throw new Denied(503, "audit_export_failed");
				const text = await response.text();
				if (text.length > 8192) throw new Denied(503, "invalid_otlp_response");
				const reply = JSON.parse(text);
				const partial = reply?.partialSuccess;
				if (
					!reply ||
					typeof reply !== "object" ||
					Array.isArray(reply) ||
					Object.keys(reply).some((k) => k !== "partialSuccess") ||
					(Object.hasOwn(reply, "partialSuccess") &&
						(!partial ||
							typeof partial !== "object" ||
							Array.isArray(partial) ||
							Object.keys(partial).some(
								(k) => k !== "rejectedLogRecords" && k !== "errorMessage",
							) ||
							(partial.rejectedLogRecords !== undefined &&
								partial.rejectedLogRecords !== 0 &&
								partial.rejectedLogRecords !== "0") ||
							(partial.errorMessage !== undefined &&
								partial.errorMessage !== "")))
				)
					throw new Denied(503, "audit_partial_or_invalid");
				await sql`UPDATE gw_audit_state SET delivered=GREATEST(delivered,${events.at(-1)!.seq}) WHERE org=${state.org}`;
				accepted += events.length;
			}
			return accepted;
		} finally {
			busy = false;
		}
	}
	return { exportOnce };
}
