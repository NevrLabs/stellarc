import assert from "node:assert/strict";
import postgres from "postgres";
import { gatewaySchema, gatewayStore } from "./store";

// Separate worker processes exercise actual interruption, not a second function call.
if (process.argv[2] === "terminal-worker") {
	const workerSql = postgres(process.env.SPIKE_RUNTIME_DSN!, {
		max: 1,
		onnotice: () => {},
	});
	try {
		const worker = gatewayStore(workerSql);
		if (process.argv[3] === "recover") await worker.recover();
		else {
			await assert.rejects(worker.finish(process.argv[3], "cancelled"));
			console.log("TERMINAL_PENDING");
			await new Promise(() => {
				setInterval(() => {}, 1000);
			});
		}
	} finally {
		await workerSql.end();
	}
	process.exit(0);
}

// Fresh disposable PG only; runtime role exercises real append-only permissions.
const owner = postgres(process.env.SPIKE_OWNER_DSN!, {
	max: 3,
	onnotice: () => {},
});
await owner.unsafe(gatewaySchema);
// Disposable legacy-shape upgrade: preserve admission identity, never invent success.
await owner`INSERT INTO gw_principal(id,kind,org,permissions) VALUES ('legacy-agent','agent','legacy','[]'::jsonb)`;
await owner`ALTER TABLE gw_run DROP COLUMN terminal_choice, DROP COLUMN recover_after`;
await owner`ALTER TABLE gw_run DROP CONSTRAINT gw_run_outcome_check`;
await owner`ALTER TABLE gw_run ADD CONSTRAINT gw_run_outcome_check CHECK(outcome IN ('running','completed','cancelled','failed'))`;
const legacyId = crypto.randomUUID();
await owner`INSERT INTO gw_run(id,org,actor,subject,request,trace,action,started_at) VALUES (${legacyId},'legacy','legacy-agent','legacy-agent','legacy-admission','','mcp:status',clock_timestamp()-interval '1 hour')`;
await owner.unsafe(gatewaySchema);
const upgraded =
	await owner`SELECT actor,request,outcome,terminal_choice,recover_after>clock_timestamp() AS grace FROM gw_run WHERE id=${legacyId}`;
assert.deepEqual(
	upgraded.map((row) => ({ ...row })),
	[
		{
			actor: "legacy-agent",
			request: "legacy-admission",
			outcome: "running",
			terminal_choice: null,
			grace: true,
		},
	],
);
await owner.unsafe(gatewaySchema);
await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${legacyId}`;
await gatewayStore(owner).recover();
assert.equal(
	(await owner`SELECT outcome FROM gw_run WHERE id=${legacyId}`)[0].outcome,
	"interrupted",
);
assert.equal(
	(
		await owner`SELECT payload FROM gw_audit WHERE payload->>'run'=${legacyId}`
	)[0].payload.externalEffect,
	"unknown",
);
console.log(
	"PASS legacy-schema-upgrade-idempotent-preserves-admission-no-invented-success",
);
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state TO gateway_runtime`;
await owner`GRANT SELECT ON gw_installation TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
const sql = postgres(process.env.SPIKE_RUNTIME_DSN!, {
	max: 4,
	onnotice: () => {},
});
const store = gatewayStore(sql);
const checks: string[] = [
	"legacy-schema-upgrade-idempotent-preserves-admission-no-invented-success",
];
const pass = (s: string) => {
	checks.push(s);
	console.log(`PASS ${s}`);
};
try {
	await store.bootstrap("human", "approved-sub", "alpha");
	const a = await store.createAgent("human", ["llm:stream", "mcp:status"]);
	const b = await store.createAgent("human", ["mcp:status"]);
	const first = await store.issue("human", a);
	const second = await store.issue("human", a);
	const other = await store.issue("human", b);
	assert.equal(
		(
			await store.authorize(
				first.raw,
				"alpha",
				"llm:stream",
				"standalone",
				"trace",
			)
		).subject,
		a,
	);
	await store.revoke("human", first.id);
	await assert.rejects(
		store.authorize(first.raw, "alpha", "mcp:status", "revoked", "trace"),
	);
	assert.equal(
		(
			await store.authorize(
				second.raw,
				"alpha",
				"mcp:status",
				"rotated",
				"trace",
			)
		).principal.id,
		a,
	);
	pass("stable-agent-independent-credentials-and-self-authority");
	await assert.rejects(
		store.authorize(second.raw, "beta", "mcp:status", "cross-org", "trace"),
	);
	await assert.rejects(
		store.authorize(other.raw, "alpha", "llm:stream", "scope", "trace"),
	);
	pass("tenant-and-scope-denied");
	const runOne = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"run-one",
		"trace",
	);
	const runTwo = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"run-two",
		"trace",
	);
	assert.notEqual(runOne.runId, runTwo.runId);
	assert.match(runOne.runId!, /^[a-f0-9-]{36}$/);
	await store.finish(runOne.runId!, "completed");
	await store.finish(runOne.runId!, "completed");
	await assert.rejects(store.finish(runOne.runId!, "failed"));
	const terminal =
		await owner`SELECT payload FROM gw_audit WHERE kind='call.completed' AND payload->>'run'=${runOne.runId!}`;
	assert.equal(terminal.length, 1);
	assert.equal(terminal[0].payload.usage, "unavailable");
	const persisted =
		await owner`SELECT actor,org,outcome FROM gw_run WHERE id=${runOne.runId!}`;
	assert.equal(persisted[0].actor, a);
	assert.equal(persisted[0].org, "alpha");
	assert.equal(persisted[0].outcome, "completed");
	pass("server-owned-per-invocation-run-binding-idempotent-terminal-audit");
	await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
	try {
		await assert.rejects(store.finish(runTwo.runId!, "cancelled"));
		const pending =
			await owner`SELECT outcome,ended_at FROM gw_run WHERE id=${runTwo.runId!}`;
		assert.equal(pending[0].outcome, "running");
		assert.equal(pending[0].ended_at, null);
	} finally {
		await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
	}
	await assert.rejects(
		gatewayStore(sql).finish(runTwo.runId!, "completed"),
		"fresh store cannot replace the terminal choice after failed audit",
	);
	await gatewayStore(sql).recover();
	await gatewayStore(sql).finish(runTwo.runId!, "cancelled");
	const recovered =
		await owner`SELECT outcome FROM gw_run WHERE id=${runTwo.runId!}`;
	assert.equal(recovered[0].outcome, "cancelled");
	const recoveredEvents =
		await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${runTwo.runId!} AND kind IN ('call.cancelled','call.completed','call.failed')`;
	assert.deepEqual(
		recoveredEvents.map((row) => row.kind),
		["call.cancelled"],
	);
	pass("terminal-audit-permission-outage-rolls-back-and-fresh-store-retries");
	const orphan = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"orphan",
		"trace",
	);
	const active = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"active",
		"trace",
	);
	await gatewayStore(sql).recover();
	assert.equal(
		(await owner`SELECT outcome FROM gw_run WHERE id=${active.runId!}`)[0]
			.outcome,
		"running",
	);
	await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${orphan.runId!}`;
	await Promise.all([gatewayStore(sql).recover(), gatewayStore(sql).recover()]);
	const interrupted =
		await owner`SELECT outcome FROM gw_run WHERE id=${orphan.runId!}`;
	assert.equal(interrupted[0].outcome, "interrupted");
	const interruptedAudit =
		await owner`SELECT kind,payload FROM gw_audit WHERE payload->>'run'=${orphan.runId!} AND kind='call.interrupted'`;
	assert.equal(interruptedAudit.length, 1);
	assert.equal(interruptedAudit[0].payload.externalEffect, "unknown");
	assert.equal(
		(await owner`SELECT outcome FROM gw_run WHERE id=${active.runId!}`)[0]
			.outcome,
		"running",
	);
	await store.finish(active.runId!, "cancelled");
	pass("bounded-recovery-interrupted-orphan-not-live-run-no-effect-replay");
	await store.bootstrap("human-beta", "approved-beta-sub", "beta");
	const betaAgent = await store.createAgent("human-beta", ["mcp:status"]);
	const betaCredential = await store.issue("human-beta", betaAgent);
	const blockedRuns: string[] = [];
	for (let n = 0; n < 16; n++) {
		const admitted = await store.authorize(
			second.raw,
			"alpha",
			"mcp:status",
			`blocked-${n}`,
			"trace",
		);
		blockedRuns.push(admitted.runId!);
	}
	const healthyRun = await store.authorize(
		betaCredential.raw,
		"beta",
		"mcp:status",
		"healthy-recovery",
		"trace",
	);
	await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '2 seconds' WHERE id IN ${owner(blockedRuns)}`;
	await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${healthyRun.runId!}`;
	const [alphaAudit] =
		await owner`SELECT delivered::text FROM gw_audit_state WHERE org='alpha'`;
	// Artificial counter positioning isolates one org's terminal audit exhaustion.
	await owner`UPDATE gw_audit_state SET delivered=seq-1100 WHERE org='alpha'`;
	try {
		await assert.rejects(store.recover());
		await store.recover().catch(() => {});
		assert.equal(
			(await owner`SELECT outcome FROM gw_run WHERE id=${healthyRun.runId!}`)[0]
				.outcome,
			"interrupted",
			"an exhausted org must not monopolize every recovery batch",
		);
	} finally {
		await owner`UPDATE gw_audit_state SET delivered=${alphaAudit.delivered} WHERE org='alpha'`;
		await store.recover();
		await store.recover();
	}
	pass("recovery-rotates-exhausted-org-without-starving-healthy-org");
	const killedRun = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"killed-worker",
		"trace",
	);
	await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
	const workerProcess = Bun.spawn(
		[process.execPath, import.meta.path, "terminal-worker", killedRun.runId!],
		{ stdout: "pipe", stderr: "pipe" },
	);
	try {
		const reader = workerProcess.stdout.getReader();

		const ready = await Promise.race([
			reader.read(),
			new Promise<never>((_, reject) => {
				const timer = setTimeout(
					() => reject(new Error("terminal worker readiness timeout")),
					10000,
				);
				timer.unref();
			}),
		]);
		assert.match(new TextDecoder().decode(ready.value), /TERMINAL_PENDING/);
		const pending =
			await owner`SELECT outcome,terminal_choice FROM gw_run WHERE id=${killedRun.runId!}`;
		assert.equal(pending[0].outcome, "running");
		assert.equal(pending[0].terminal_choice, "cancelled");
		workerProcess.kill("SIGKILL");
		await workerProcess.exited;
	} finally {
		workerProcess.kill("SIGKILL");
		await workerProcess.exited;
		await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
	}
	const replacement = Bun.spawn(
		[process.execPath, import.meta.path, "terminal-worker", "recover"],
		{ stdout: "pipe", stderr: "pipe" },
	);
	assert.equal(
		await replacement.exited,
		0,
		"replacement recovery worker must finish",
	);
	const afterKill =
		await owner`SELECT outcome FROM gw_run WHERE id=${killedRun.runId!}`;
	assert.equal(afterKill[0].outcome, "cancelled");
	const killEvents =
		await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${killedRun.runId!} AND kind='call.cancelled'`;
	assert.equal(killEvents.length, 1);
	pass("sigkill-after-terminal-choice-fresh-process-recovers-one-event");
	const backlogRun = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"pending-backlog",
		"trace",
	);
	await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
	try {
		await assert.rejects(store.finish(backlogRun.runId!, "cancelled"));
	} finally {
		await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
	}
	await assert.rejects(
		store.authorize(
			second.raw,
			"alpha",
			"mcp:status",
			"deny-pending-backlog",
			"trace",
		),
		(error: unknown) =>
			error instanceof Error && error.message === "terminal_backlog",
		"pending terminal bookkeeping must stop new admission in its organization",
	);
	await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"existing-authority-check",
		"trace",
		undefined,
		false,
	);
	await store.recover();
	const overdue = await store.authorize(
		second.raw,
		"alpha",
		"mcp:status",
		"overdue-backlog",
		"trace",
	);
	await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${overdue.runId!}`;
	await assert.rejects(
		store.authorize(
			second.raw,
			"alpha",
			"mcp:status",
			"deny-overdue-backlog",
			"trace",
		),
		/terminal_backlog/,
	);
	await store.recover();
	const beforeCeiling =
		await owner`SELECT count(*)::int AS n FROM gw_run WHERE outcome='running'`;
	const positioned =
		await owner`INSERT INTO gw_run(id,org,actor,subject,request,trace,action) SELECT gen_random_uuid(),'alpha',${a},${a},'positioned-ceiling','','mcp:status' FROM generate_series(1,64-${beforeCeiling[0].n}) RETURNING id`;
	try {
		await assert.rejects(
			store.authorize(
				betaCredential.raw,
				"beta",
				"mcp:status",
				"deny-global-ceiling",
				"trace",
			),
			/run_capacity/,
		);
		assert.equal(
			(
				await owner`SELECT count(*)::int AS n FROM gw_run WHERE outcome='running'`
			)[0].n,
			64,
		);
	} finally {
		await owner`DELETE FROM gw_run WHERE request='positioned-ceiling'`;
	}
	assert.ok(positioned.length);
	await store.authorize(
		betaCredential.raw,
		"beta",
		"mcp:status",
		"capacity-restored",
		"trace",
	);
	pass("terminal-backlog-and-global-run-ceiling-stop-new-admission-only");
	const delegation = await store.delegate("human", a, {
		actions: ["mcp:status"],
		resource: "gateway",
		ttl: 120,
		calls: 3,
	});
	const child = await store.delegate(
		a,
		b,
		{
			actions: ["mcp:status"],
			resource: "gateway",
			ttl: 60,
			calls: 2,
			parent: delegation,
		},
		second.raw,
	);
	await assert.rejects(
		store.delegate(
			a,
			b,
			{
				actions: ["llm:stream"],
				resource: "gateway",
				ttl: 60,
				calls: 1,
				parent: delegation,
			},
			second.raw,
		),
	);
	await assert.rejects(
		store.delegate(
			a,
			b,
			{
				actions: ["mcp:status"],
				resource: "gateway",
				ttl: 180,
				calls: 1,
				parent: delegation,
			},
			second.raw,
		),
	);
	await assert.rejects(
		store.delegate(
			a,
			b,
			{
				actions: ["mcp:status"],
				resource: "gateway",
				ttl: 60,
				calls: 4,
				parent: delegation,
			},
			second.raw,
		),
	);
	const allowed = await store.authorize(
		other.raw,
		"alpha",
		"mcp:status",
		"delegated",
		"trace",
		child,
	);
	assert.equal(allowed.subject, "human");
	assert.equal(allowed.principal.id, b);
	await assert.rejects(
		store.authorize(other.raw, "alpha", "llm:stream", "widen", "trace", child),
	);
	const audit =
		await owner`SELECT actor,subject,payload FROM gw_audit WHERE request='delegated' AND kind='call.admit'`;
	assert.equal(audit[0].actor, b);
	assert.equal(audit[0].subject, "human");
	assert.equal(audit[0].payload.delegation, child);
	pass("explicit-narrowing-delegation-actor-subject-audit");
	await store.authorize(
		other.raw,
		"alpha",
		"mcp:status",
		"budget-final",
		"trace",
		child,
	);
	await assert.rejects(
		store.authorize(
			other.raw,
			"alpha",
			"mcp:status",
			"budget-exhausted",
			"trace",
			child,
		),
	);
	pass("shared-ancestor-and-child-call-budget");
	const revokeParent = await store.delegate("human", a, {
		actions: ["mcp:status"],
		resource: "gateway",
		ttl: 120,
		calls: 3,
	});
	const revokeChild = await store.delegate(
		a,
		b,
		{
			actions: ["mcp:status"],
			resource: "gateway",
			ttl: 60,
			calls: 2,
			parent: revokeParent,
		},
		second.raw,
	);
	await store.revoke("human", revokeParent, true);
	await assert.rejects(
		store.authorize(
			other.raw,
			"alpha",
			"mcp:status",
			"ancestor-revoked",
			"trace",
			revokeChild,
			false,
		),
	);
	pass("ancestor-revocation-current-check");
	await owner`UPDATE gw_principal SET permissions='[]'::jsonb WHERE id='human'`;
	await assert.rejects(
		store.authorize(
			other.raw,
			"alpha",
			"mcp:status",
			"human-rights-removed",
			"trace",
			child,
			false,
		),
	);
	assert.equal(
		(
			await store.authorize(
				other.raw,
				"alpha",
				"mcp:status",
				"independent-not-human",
				"trace",
			)
		).subject,
		b,
	);
	await owner`UPDATE gw_principal SET permissions='["manage","llm:stream","mcp:status"]'::jsonb WHERE id='human'`;
	pass("human-rights-removal-does-not-disable-independent-agent");
	for (const query of [
		"DELETE FROM gw_audit",
		"UPDATE gw_audit SET kind='tampered'",
		"TRUNCATE gw_audit",
	])
		await assert.rejects(sql.unsafe(query));
	const [{ n: before }] =
		await owner`SELECT count(*)::int AS n FROM gw_credential`;
	await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
	await assert.rejects(store.issue("human", a));
	assert.equal(
		(await owner`SELECT count(*)::int AS n FROM gw_credential`)[0].n,
		before,
	);
	await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
	pass("runtime-immutable-audit-and-mutation-rollback");
	const raceA = postgres(process.env.SPIKE_RUNTIME_DSN!, {
		max: 1,
		onnotice: () => {},
		connection: { application_name: "gw-race-a" },
	});
	const raceB = postgres(process.env.SPIKE_RUNTIME_DSN!, {
		max: 1,
		onnotice: () => {},
		connection: { application_name: "gw-race-b" },
	});
	const waiting = async (name: string) => {
		for (let n = 0; n < 1000; n++) {
			const rows =
				await owner`SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name=${name} AND l.locktype='advisory' AND NOT l.granted`;
			if (rows.length) return;
		}
		throw new Error(`Missing DB lock barrier: ${name}`);
	};
	try {
		for (const revokeFirst of [true, false]) {
			const issued = await store.issue("human", a);
			let unlock!: () => void;
			let locked!: () => void;
			const gate = new Promise<void>((resolve) => {
				unlock = resolve;
			});
			const ready = new Promise<void>((resolve) => {
				locked = resolve;
			});
			const blocker = owner.begin(async (tx) => {
				await tx`SELECT pg_advisory_xact_lock(719324821)`;
				locked();
				await gate;
			});
			await ready;
			const revoke = () => gatewayStore(raceA).revoke("human", issued.id);
			const admit = () =>
				gatewayStore(raceB).authorize(
					issued.raw,
					"alpha",
					"mcp:status",
					`race-${revokeFirst}`,
					"",
				);
			try {
				const first = (revokeFirst ? revoke() : admit()).then(
					(value) => ({ value }),
					(error) => ({ error }),
				);
				await waiting(revokeFirst ? "gw-race-a" : "gw-race-b");
				const second = (revokeFirst ? admit() : revoke()).then(
					(value) => ({ value }),
					(error) => ({ error }),
				);
				await waiting(revokeFirst ? "gw-race-b" : "gw-race-a");
				unlock();
				await blocker;
				const [one, two] = await Promise.all([first, second]);
				assert.ok(!("error" in one));
				assert.equal("error" in two, revokeFirst);
			} finally {
				unlock();
				await blocker;
			}
			await assert.rejects(
				store.authorize(
					issued.raw,
					"alpha",
					"mcp:status",
					"after-race",
					"",
					undefined,
					false,
				),
			);
		}
	} finally {
		await raceA.end();
		await raceB.end();
	}
	pass("serialized-revoke-admit-both-orders-db-lock-barriers");
	await owner`UPDATE gw_credential SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${second.id}`;
	await assert.rejects(
		store.authorize(second.raw, "alpha", "mcp:status", "expired", "trace"),
	);
	pass("credential-expiry-current-check");
	// --- r10: caller-owned-transaction authority recheck (core tx authority) ---
	const failures: string[] = [];
	const attempt = async (name: string, body: () => Promise<void>) => {
		try {
			await body();
			pass(name);
		} catch (error) {
			failures.push(name);
			console.log(
				`RED ${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};
	const coreCred = await store.issue("human", a);
	const coreAdmit = await store.authorize(
		coreCred.raw,
		"alpha",
		"mcp:status",
		"coretx-plain",
		"trace",
	);
	const plainCtx = {
		org: "alpha",
		actor: a,
		subject: a,
		action: "mcp:status",
		runId: coreAdmit.runId!,
	};
	await attempt("tx-recheck-inside-caller-transaction-max1-pool-no-nesting", async () => {
		const single = postgres(process.env.SPIKE_RUNTIME_DSN!, {
			max: 1,
			onnotice: () => {},
			connection: { application_name: "gw-coretx-single" },
		});
		try {
			const one = gatewayStore(single);
			const sideEffects = async () =>
				(
					await owner`SELECT (SELECT count(*)::int FROM gw_run) AS runs,
						(SELECT count(*)::int FROM gw_audit) AS events,
						(SELECT coalesce(sum(remaining),0)::int FROM gw_delegation) AS budget`
				)[0];
			const before = await sideEffects();
			// A helper that opened its own transaction would need a second
			// connection: on a max:1 pool that can only hang, which the bound
			// below converts into a failure instead of a deadlock.
			const verdict = await Promise.race([
				one.transaction((tx) => one.reauthorize(tx, coreCred.raw, plainCtx)),
				new Promise<never>((_, reject) => {
					setTimeout(
						() => reject(new Error("recheck hung on max:1 pool")),
						15000,
					).unref();
				}),
			]);
			assert.equal(verdict.principal.id, a);
			assert.equal(verdict.subject, a);
			assert.deepEqual(await sideEffects(), before);
		} finally {
			await single.end();
		}
	});
	const zeroParent = await store.delegate("human", a, {
		actions: ["mcp:status"],
		resource: "gateway",
		ttl: 300,
		calls: 1,
	});
	const zeroChild = await store.delegate(
		a,
		b,
		{
			actions: ["mcp:status"],
			resource: "gateway",
			ttl: 120,
			calls: 1,
			parent: zeroParent,
		},
		coreCred.raw,
	);
	const zeroRun = await store.authorize(
		other.raw,
		"alpha",
		"mcp:status",
		"coretx-zero-budget",
		"trace",
		zeroChild,
	);
	assert.equal(zeroRun.subject, "human");
	const zeroBudget = async () =>
		(
			await owner`SELECT remaining::int FROM gw_delegation WHERE id IN ${owner([zeroParent, zeroChild])} ORDER BY id`
		).map((row) => row.remaining);
	assert.deepEqual(await zeroBudget(), [0, 0]);
	await attempt(
		"admitted-zero-budget-remains-recheckable-no-spend-no-new-run-or-admission",
		async () => {
			const verdict = await store.transaction((tx) =>
				store.reauthorize(tx, other.raw, {
					org: "alpha",
					actor: b,
					subject: "human",
					delegation: zeroChild,
					action: "mcp:status",
					runId: zeroRun.runId!,
				}),
			);
			assert.equal(verdict.principal.id, b);
			assert.equal(verdict.subject, "human");
			assert.deepEqual(await zeroBudget(), [0, 0]);
			assert.equal(
				(
					await owner`SELECT count(*)::int AS n FROM gw_run WHERE id=${zeroRun.runId!}`
				)[0].n,
				1,
			);
			assert.equal(
				(
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='call.admit' AND payload->>'run'=${zeroRun.runId!}`
				)[0].n,
				1,
			);
		},
	);
	const gated = await store.issue("human", a);
	const gatedRun = await store.authorize(
		gated.raw,
		"alpha",
		"mcp:status",
		"coretx-gated",
		"trace",
	);
	const zeroCtx = {
		org: "alpha",
		actor: b,
		subject: "human",
		delegation: zeroChild,
		action: "mcp:status",
		runId: zeroRun.runId!,
	};
	await attempt("recheck-shares-revoke-expiry-gates-with-public-authorize", async () => {
		await store.revoke("human", gated.id);
		await assert.rejects(
			store.transaction((tx) =>
				store.reauthorize(tx, gated.raw, {
					org: "alpha",
					actor: a,
					subject: a,
					action: "mcp:status",
					runId: gatedRun.runId!,
				}),
			),
			/invalid_credential/,
		);
		try {
			await owner`UPDATE gw_credential SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${other.id}`;
			await assert.rejects(
				store.transaction((tx) => store.reauthorize(tx, other.raw, zeroCtx)),
				/invalid_credential/,
			);
			await owner`UPDATE gw_credential SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=${other.id}`;
			await owner`UPDATE gw_delegation SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${zeroChild}`;
			await assert.rejects(
				store.transaction((tx) => store.reauthorize(tx, other.raw, zeroCtx)),
				/delegation_inactive/,
			);
			await owner`UPDATE gw_delegation SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=${zeroChild}`;
			await store.revoke("human", zeroParent, true);
			await assert.rejects(
				store.transaction((tx) => store.reauthorize(tx, other.raw, zeroCtx)),
				/delegation_inactive/,
			);
			await owner`UPDATE gw_delegation SET revoked=false WHERE id=${zeroParent}`;
			await owner`UPDATE gw_principal SET enabled=false WHERE id=${b}`;
			await assert.rejects(
				store.transaction((tx) => store.reauthorize(tx, other.raw, zeroCtx)),
				/principal_inactive/,
			);
			await owner`UPDATE gw_principal SET enabled=true WHERE id=${b}`;
			await owner`UPDATE gw_principal SET permissions='[]'::jsonb WHERE id='human'`;
			await assert.rejects(
				store.transaction((tx) => store.reauthorize(tx, other.raw, zeroCtx)),
				/subject_denied/,
			);
		} finally {
			await owner`UPDATE gw_credential SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=${other.id}`;
			await owner`UPDATE gw_delegation SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=${zeroChild}`;
			await owner`UPDATE gw_delegation SET revoked=false WHERE id=${zeroParent}`;
			await owner`UPDATE gw_principal SET enabled=true WHERE id=${b}`;
			await owner`UPDATE gw_principal SET permissions='["manage","llm:stream","mcp:status"]'::jsonb WHERE id='human'`;
		}
	});
	const actorDeleg = await store.delegate("human", a, {
		actions: ["llm:stream", "mcp:status"],
		resource: "gateway",
		ttl: 300,
		calls: 5,
	});
	const lifeRun = await store.authorize(
		coreCred.raw,
		"alpha",
		"mcp:status",
		"coretx-lifecycle",
		"trace",
	);
	const overdueRun = await store.authorize(
		coreCred.raw,
		"alpha",
		"mcp:status",
		"coretx-overdue",
		"trace",
	);
	await attempt(
		"recheck-requires-server-bound-context-and-dispatchable-lifecycle",
		async () => {
			const refuse = async (
				over: {
					org?: string;
					actor?: string;
					subject?: string;
					delegation?: string;
					action?: string;
					runId?: string;
					request?: string;
				},
				reason: RegExp,
			) => {
				const merged = {
					org: over.org ?? plainCtx.org,
					actor: over.actor ?? plainCtx.actor,
					subject: over.subject ?? plainCtx.subject,
					delegation: over.delegation,
					action: over.action ?? plainCtx.action,
					runId: over.runId ?? plainCtx.runId,
					request: over.request,
				};
				await assert.rejects(
					store.transaction((tx) =>
						store.reauthorize(tx, coreCred.raw, merged),
					),
					reason,
				);
			};
			await refuse({ runId: crypto.randomUUID() }, /run_not_found/);
			await refuse({ actor: b }, /run_context/);
			await refuse({ subject: b }, /run_context/);
			await refuse({ action: "llm:stream" }, /run_context/);
			await refuse({ delegation: actorDeleg }, /run_context/);
			await refuse({ request: "coretx-other" }, /run_context/);
			await store.finish(lifeRun.runId!, "completed");
			await refuse({ runId: lifeRun.runId! }, /run_not_dispatchable/);
			await owner`UPDATE gw_run SET terminal_choice='cancelled' WHERE id=${coreAdmit.runId!}`;
			await assert.rejects(
				store.transaction((tx) => store.reauthorize(tx, coreCred.raw, plainCtx)),
				/run_not_dispatchable/,
			);
			await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${overdueRun.runId!}`;
			await assert.rejects(
				store.transaction((tx) =>
					store.reauthorize(tx, coreCred.raw, {
						...plainCtx,
						runId: overdueRun.runId!,
					}),
				),
				/run_not_dispatchable/,
			);
			// Fail closed WITHOUT changing run lifetime: the overdue row is
			// left exactly as found for the recovery sweeper to own.
			const [row] = await owner`SELECT outcome,terminal_choice,recover_after<=clock_timestamp() AS overdue FROM gw_run WHERE id=${overdueRun.runId!}`;
			assert.deepEqual({ ...row }, {
				outcome: "running",
				terminal_choice: null,
				overdue: true,
			});
		},
	);
	await attempt("recheck-refuses-caller-transaction-without-advisory-lock", async () => {
		await assert.rejects(
			sql.begin((tx) => store.reauthorize(tx, coreCred.raw, plainCtx)),
			/caller_lock_required/,
		);
	});
	if (failures.length) {
		console.log(JSON.stringify({ failed: failures }));
		process.exitCode = 1;
	}
	const exported = JSON.stringify(await owner`SELECT * FROM gw_audit`);
	assert.ok(!exported.includes(other.raw));
	assert.ok(!exported.includes("digest"));
	const ids = await owner`SELECT id FROM gw_audit`;
	assert.equal(ids.length, new Set(ids.map((x) => x.id)).size);
	assert.ok(ids.every((x) => x.id.split(":")[0].length === 36));
	pass("installation-stable-event-ids-no-credentials");
	console.log(
		JSON.stringify({ checks, provider: "NO INFERENCE", realOidc: false }),
	);
} finally {
	await sql.end();
	await owner.end();
}
