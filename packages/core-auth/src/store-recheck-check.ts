import assert from "node:assert/strict";
import postgres from "postgres";
import { gatewaySchema, gatewayStore } from "./store";

const ownerDsn = process.env.SPIKE_OWNER_DSN;
if (typeof ownerDsn !== "string" || !ownerDsn)
	throw new Error("SPIKE_OWNER_DSN required");
const owner = postgres(ownerDsn, {
	max: 2,
	onnotice: () => {},
});
await owner.unsafe(gatewaySchema);
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state TO gateway_runtime`;
await owner`GRANT SELECT ON gw_installation TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
const runtimeDsn = process.env.SPIKE_RUNTIME_DSN;
if (typeof runtimeDsn !== "string" || !runtimeDsn)
	throw new Error("SPIKE_RUNTIME_DSN required");
const sql = postgres(runtimeDsn, {
	max: 1,
	onnotice: () => {},
});
const store = gatewayStore(sql);
try {
	await store.bootstrap("human", "subject", "alpha");
	const agent = await store.createAgent("human", ["mcp:status"]);
	const credential = await store.issue("human", agent);
	const delegation = await store.delegate("human", agent, {
		actions: ["mcp:status"],
		resource: "gateway",
		ttl: 60,
		calls: 1,
	});
	const admitted = await store.authorize(
		credential.raw,
		"alpha",
		"mcp:status",
		"bound-request",
		"trace",
		delegation,
	);
	assert.ok(admitted.runId);
	const expected = {
		runId: admitted.runId,
		org: "alpha",
		actor: agent,
		subject: "human",
		delegation,
		action: "mcp:status",
		request: "bound-request",
	};
	const recheck = () =>
		store.transaction((tx) => store.recheckRun(tx, credential.raw, expected));
	const before =
		await owner`SELECT (SELECT count(*)::int FROM gw_run) AS runs,(SELECT count(*)::int FROM gw_audit WHERE kind='call.admit') AS admits`;
	await recheck();
	await recheck();
	assert.equal(
		(await owner`SELECT remaining FROM gw_delegation WHERE id=${delegation}`)[0]
			.remaining,
		0,
	);
	assert.deepEqual(
		await owner`SELECT (SELECT count(*)::int FROM gw_run) AS runs,(SELECT count(*)::int FROM gw_audit WHERE kind='call.admit') AS admits`,
		before,
	);
	console.log(
		"PASS caller-transaction-single-connection-no-readmission-or-budget-spend",
	);
	for (const change of [
		{ actor: "foreign" },
		{ subject: agent },
		{ org: "beta" },
		{ action: "llm:stream" },
		{ request: "foreign" },
		{ delegation: undefined },
		{ runId: crypto.randomUUID() },
	]) {
		await assert.rejects(
			store.transaction((tx) =>
				store.recheckRun(tx, credential.raw, { ...expected, ...change }),
			),
		);
	}
	console.log("PASS original-run-context-mismatch-denied");
	for (const mutation of ["terminal", "overdue", "finished"] as const) {
		if (mutation === "terminal")
			await owner`UPDATE gw_run SET terminal_choice='cancelled' WHERE id=${expected.runId}`;
		if (mutation === "overdue")
			await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${expected.runId}`;
		if (mutation === "finished")
			await owner`UPDATE gw_run SET outcome='completed' WHERE id=${expected.runId}`;
		try {
			await assert.rejects(recheck());
		} finally {
			await owner`UPDATE gw_run SET terminal_choice=NULL,outcome='running',recover_after=clock_timestamp()+interval '2 minutes' WHERE id=${expected.runId}`;
		}
	}
	console.log("PASS terminal-overdue-finished-runs-denied");
	for (const mutation of [
		"credential",
		"delegation",
		"principal",
		"permissions",
		"expiry",
	] as const) {
		if (mutation === "credential")
			await owner`UPDATE gw_credential SET revoked=true WHERE id=${credential.id}`;
		if (mutation === "delegation")
			await owner`UPDATE gw_delegation SET revoked=true WHERE id=${delegation}`;
		if (mutation === "principal")
			await owner`UPDATE gw_principal SET enabled=false WHERE id='human'`;
		if (mutation === "permissions")
			await owner`UPDATE gw_principal SET permissions='[]'::jsonb WHERE id=${agent}`;
		if (mutation === "expiry")
			await owner`UPDATE gw_credential SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${credential.id}`;
		try {
			await assert.rejects(recheck());
		} finally {
			await owner`UPDATE gw_credential SET revoked=false,expires_at=clock_timestamp()+interval '1 hour' WHERE id=${credential.id}`;
			await owner`UPDATE gw_delegation SET revoked=false WHERE id=${delegation}`;
			await owner`UPDATE gw_principal SET enabled=true WHERE id='human'`;
			await owner`UPDATE gw_principal SET permissions='["mcp:status"]'::jsonb WHERE id=${agent}`;
		}
	}
	await recheck();
	console.log(
		"PASS committed-credential-delegation-subject-and-permission-revocation-denied",
	);
	console.log("CORE RECHECK CHECK PASSED 4 groups");
} finally {
	await sql.end();
	await owner.end();
}
