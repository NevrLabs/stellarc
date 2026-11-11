import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { grantRuntime } from "../../../packages/db/src/migrate";
import { ddl, gateway } from "./gateway";

// Fresh process: test Metric registries/exporters cannot consume this process's delta.
// Same disposable-only DB contract as check.ts; NEVER use an existing DB.
const ownerDsn = process.env.SPIKE_OWNER_DSN;
if (typeof ownerDsn !== "string" || !ownerDsn)
	throw new Error("SPIKE_OWNER_DSN required");
const owner = postgres(ownerDsn, {
	max: 3,
	onnotice: () => {},
});
await owner.unsafe(
	await readFile(
		new URL(
			"../../../packages/db/migrations/0001_foundation.sql",
			import.meta.url,
		),
		"utf8",
	),
);
await owner.unsafe(ddl);
await owner`CREATE TABLE stellarc_migration(version text PRIMARY KEY, checksum text NOT NULL)`;
await owner`CREATE ROLE authgw_runtime LOGIN PASSWORD 'disposable-only'`;
await grantRuntime(owner, "authgw_runtime");
await owner`GRANT SELECT,INSERT,UPDATE ON authgw_grant,authgw_cursor TO authgw_runtime`;
await owner`GRANT SELECT,UPDATE ON authgw_member TO authgw_runtime`;
await owner`INSERT INTO authgw_member VALUES ('spike-dev','fixture-actor')`;
const runtimeDsn = process.env.SPIKE_RUNTIME_DSN;
if (typeof runtimeDsn !== "string" || !runtimeDsn)
	throw new Error("SPIKE_RUNTIME_DSN required");
const sql = postgres(runtimeDsn, {
	max: 4,
	onnotice: () => {},
});
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
assert.ok(endpoint, "Explicit existing OTLP endpoint required");
const gw = gateway(sql, `${endpoint.replace(/\/$/, "")}/v1/logs`);
try {
	const grant = await gw.issue("spike-dev", "fixture-actor");
	const request = new Request("http://fixture/orgs/spike-dev/stream", {
		method: "POST",
		headers: { authorization: `Bearer ${grant.raw}` },
	});
	const response = await gw.handler(request);
	assert.equal(response.status, 200);
	assert.match(await response.text(), /fixture-3/);
	await gw.drain();
	await gw.revoke(grant.id);
	const count = await gw.exportAudit();
	assert.equal(count, 3);
	assert.equal(await gw.exportAudit(), 0);
	const events =
		await owner`SELECT payload->>'eventId' AS event_id,payload->>'traceId' AS trace_id,plugin_type FROM event ORDER BY event.seq`;
	console.log(
		JSON.stringify({
			kind: "fixture-stream-and-durable-audit-export",
			provider: "LOCAL FIXTURE ONLY",
			oidc: false,
			requestId: response.headers.get("x-request-id"),
			traceId: response.headers.get("x-trace-id"),
			receiverAccepted: count,
			events,
		}),
	);
} finally {
	await gw.dispose();
	await sql.end();
	await owner.end();
}
