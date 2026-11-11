import assert from "node:assert/strict";
import postgres from "postgres";
import { auditExporter } from "./audit";
import { gatewaySchema, gatewayStore } from "./store";

// Disposable PostgreSQL and local OTLP only. Acceptance is not Maple persistence.
const owner = postgres(process.env.SPIKE_OWNER_DSN!, {
	max: 3,
	onnotice: () => {},
});
await owner.unsafe(gatewaySchema);
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state TO gateway_runtime`;
await owner`GRANT SELECT ON gw_installation TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
const sql = postgres(process.env.SPIKE_RUNTIME_DSN!, {
	max: 3,
	onnotice: () => {},
});
const store = gatewayStore(sql);
const batches: unknown[] = [];
let mode: "ok" | "checkpoint" | "timeout" | "status" | "malformed" | "partial" =
	"ok";
let reply: unknown = {};
const sink = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		batches.push(await request.json());
		if (mode === "checkpoint")
			await owner`REVOKE UPDATE ON gw_audit_state FROM gateway_runtime`;
		if (mode === "timeout") await Bun.sleep(3300);
		if (mode === "status") return new Response("unavailable", { status: 503 });
		if (mode === "malformed") return new Response("not-json");
		return Response.json(mode === "partial" ? reply : {});
	},
});
const endpoint = `http://127.0.0.1:${sink.port}`;
const exporter = () => auditExporter(sql, endpoint);
const cursor = async () =>
	(await owner`SELECT delivered::text FROM gw_audit_state WHERE org='alpha'`)[0]
		.delivered;
const checks: string[] = [];
const pass = (name: string) => {
	checks.push(name);
	console.log(`PASS ${name}`);
};
try {
	await store.bootstrap("human", "approved-sub", "alpha");
	const agent = await store.createAgent("human", ["mcp:status"]);
	const credential = await store.issue("human", agent);
	for (const invalid of [
		null,
		[],
		1,
		{ unknown: true },
		{ partialSuccess: null },
		{ partialSuccess: [] },
		{ partialSuccess: 1 },
		{ partialSuccess: { unknown: true } },
		{ partialSuccess: { rejectedLogRecords: 1 } },
		{ partialSuccess: { errorMessage: "rejected" } },
	]) {
		mode = "partial";
		reply = invalid;
		await assert.rejects(exporter().exportOnce());
		assert.equal(await cursor(), "0");
	}
	for (const failure of ["status", "malformed"] as const) {
		mode = failure;
		await assert.rejects(exporter().exportOnce());
		assert.equal(await cursor(), "0");
	}
	pass("invalid-otlp-ack-retains-cursor");
	mode = "timeout";
	await assert.rejects(exporter().exportOnce());
	assert.equal(await cursor(), "0");
	const uncertain = batches.at(-1);
	mode = "ok";
	assert.equal(await exporter().exportOnce(), 3);
	assert.deepEqual(batches.at(-1), uncertain);
	assert.equal(await cursor(), "3");
	pass("timeout-after-acceptance-stable-replay");
	await store.authorize(
		credential.raw,
		"alpha",
		"mcp:status",
		"checkpoint",
		"",
	);
	mode = "checkpoint";
	await assert.rejects(exporter().exportOnce());
	assert.equal(await cursor(), "3");
	const checkpoint = batches.at(-1);
	await owner`GRANT UPDATE ON gw_audit_state TO gateway_runtime`;
	mode = "ok";
	assert.equal(await exporter().exportOnce(), 1);
	assert.deepEqual(batches.at(-1), checkpoint);
	assert.equal(await cursor(), "4");
	assert.equal(await exporter().exportOnce(), 0);
	pass("accepted-before-checkpoint-failure-replays-on-fresh-exporter");
	// Artificial counter positioning tests capacity decisions, not a full load.
	await owner`UPDATE gw_audit_state SET seq=1004 WHERE org='alpha'`;
	const count = async () =>
		(await owner`SELECT count(*)::int AS n FROM gw_credential`)[0].n;
	const before = await count();
	await assert.rejects(store.issue("human", agent));
	assert.equal(await count(), before);
	assert.equal(
		(await owner`SELECT gap FROM gw_audit_state WHERE org='system'`)[0].gap,
		true,
	);
	await store.revoke("human", credential.id);
	assert.equal(
		(
			await owner`SELECT revoked FROM gw_credential WHERE id=${credential.id}`
		)[0].revoked,
		true,
	);
	pass("normal-backlog-fails-closed-with-persisted-gap-and-revoke-reserve");
	const retained = await store.transaction(async (tx) => {
		const id = crypto.randomUUID();
		await tx`INSERT INTO gw_credential(id,principal,digest,expires_at) VALUES (${id},${agent},${crypto.randomUUID()},clock_timestamp()+interval '1 hour')`;
		return id;
	});
	await owner`UPDATE gw_audit_state SET seq=delivered+1100 WHERE org='alpha'`;
	await assert.rejects(store.revoke("human", retained));
	assert.equal(
		(await owner`SELECT revoked FROM gw_credential WHERE id=${retained}`)[0]
			.revoked,
		false,
	);
	pass("emergency-exhaustion-rolls-back-revocation");
	assert.ok(!JSON.stringify(batches).includes(credential.raw));
	console.log(
		JSON.stringify({
			checks,
			realOidc: false,
			maplePersistence: false,
			capacityEvidence: "ARTIFICIAL COUNTER POSITIONING",
		}),
	);
} finally {
	sink.stop(true);
	await sql.end();
	await owner.end();
}
