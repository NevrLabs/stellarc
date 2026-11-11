import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
	gatewaySchema,
	gatewayStore,
} from "../../../packages/core-auth/src/store";
import {
	type ClaimRecheck,
	createToolApprovals,
	type FrozenIdentity,
	type GatewayStore,
	toolApprovalSchema,
} from "./tool-approval";

// Fixture key handle only: derived bytes, never real key material.
const fixtureKey = () =>
	createHash("sha256").update("fixture-approval-key-handle").digest();
const bounds = {
	maxPayloadBytes: 2048,
	maxProjectionBytes: 1024,
	maxPendingPerOrg: 64,
	claimLeaseSeconds: 3,
};
const smallBounds = { ...bounds, maxPendingPerOrg: 2 };
const human = "human";
const humanBeta = "human-beta";
const rejects = async (promise: Promise<unknown>, reason: string) =>
	assert.rejects(promise, (error: unknown) => {
		assert.ok(error instanceof Error, `expected Denied for ${reason}`);
		assert.equal((error as { reason?: string }).reason, reason);
		return true;
	});

// Separate worker processes exercise real cross-process claim contention.
if (process.argv[2] === "claim-worker") {
	const workerDsn = process.env.SPIKE_RUNTIME_DSN;
	if (typeof workerDsn !== "string" || !workerDsn)
		throw new Error("SPIKE_RUNTIME_DSN required");
	const workerSql = postgres(workerDsn, {
		max: 1,
		onnotice: () => {},
	});
	try {
		const worker = createToolApprovals(
			gatewayStore(workerSql),
			fixtureKey(),
			bounds,
		);
		const name = `worker-${process.argv[4]}`;
		try {
			const claimId = process.argv[3];
			if (typeof claimId !== "string") throw new Error("claim id required");
			const payload = await worker.claim(
				claimId,
				"alpha",
				name,
				async () => true,
			);
			console.log(`CLAIMED ${(payload.args as { marker: string }).marker}`);
			if (process.env.WORKER_HOLD) {
				await new Promise(() => {
					setInterval(() => {}, 1000);
				});
			}
		} catch (error) {
			console.log(`DENIED ${(error as { reason?: string }).reason ?? "error"}`);
		}
	} finally {
		await workerSql.end();
	}
	process.exit(0);
}

// Fresh disposable PG only; runtime role exercises real grants.
const ownerDsn = process.env.SPIKE_OWNER_DSN;
if (typeof ownerDsn !== "string" || !ownerDsn)
	throw new Error("SPIKE_OWNER_DSN required");
const owner = postgres(ownerDsn, {
	max: 4,
	onnotice: () => {},
});
await owner.unsafe(gatewaySchema);
await owner.unsafe(toolApprovalSchema);
await gatewayStore(owner).bootstrap(human, "approved-sub", "alpha");
await gatewayStore(owner).bootstrap(humanBeta, "approved-beta-sub", "beta");
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state,gw_tool_approval TO gateway_runtime`;
await owner`GRANT SELECT ON gw_installation TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
const runtimeDsn = process.env.SPIKE_RUNTIME_DSN;
if (typeof runtimeDsn !== "string" || !runtimeDsn)
	throw new Error("SPIKE_RUNTIME_DSN required");
const sql = postgres(runtimeDsn, {
	max: 4,
	onnotice: () => {},
});
const store = gatewayStore(sql);
const approvals = createToolApprovals(store, fixtureKey(), bounds);
// Council R2 regression groups (reg-f*) use a 1s claim lease so recovery
// classification needs only a ~1.3s semantic lease-expiry wait. Every other
// bound is identical; claim/report behavior does not depend on the lease.
const tightLease = { ...bounds, claimLeaseSeconds: 1 };
const tightApprovals = createToolApprovals(store, fixtureKey(), tightLease);
const agent = await store.createAgent(human, ["mcp:status"]);
const agentCred = await store.issue(human, agent);
const betaAgent = await store.createAgent(humanBeta, ["mcp:status"]);
const betaCred = await store.issue(humanBeta, betaAgent);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
let sequence = 0;
const frozenArgs = () => ({
	to: ["fixture@example.invalid"],
	text: "fixture-frozen-args-never-leak",
	marker: `MARK-${++sequence}`,
});
const identityOf = (args: unknown): FrozenIdentity => ({
	operation: "resend-emails",
	revision: "r1",
	method: "POST",
	effectClass: "irreversible",
	binding: sha(JSON.stringify(["fixture-config", args])),
	requestDigest: sha(JSON.stringify(["fixture-request", args])),
});
// enqueue() keeps `args` a general unknown payload (the production contract).
// Groups that read the fixture text/marker must narrow to that shape first —
// the predicate is a real runtime check, not a cast over the payload.
const isFixtureArgs = (
	value: unknown,
): value is { text: string; marker: string } =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { text?: unknown }).text === "string" &&
	typeof (value as { marker?: unknown }).marker === "string";
async function enqueue(options?: {
	ttlSeconds?: number;
	args?: unknown;
	bounds?: typeof bounds;
	org?: "alpha" | "beta";
}) {
	const org = options?.org ?? "alpha";
	const credential = org === "alpha" ? agentCred.raw : betaCred.raw;
	const label = `approval-${++sequence}`;
	const admitted = await store.authorize(
		credential,
		org,
		"mcp:status",
		label,
		"trace-approval",
	);
	const args = options?.args ?? frozenArgs();
	const identity = identityOf(args);
	const created = await (options?.bounds
		? createToolApprovals(store, fixtureKey(), options.bounds)
		: approvals
	).enqueue({
		context: {
			org,
			actor: admitted.principal.id,
			subject: admitted.subject,
			runId: admitted.runId as string,
			request: label,
			trace: "trace-approval",
		},
		identity,
		projection: {
			operation: identity.operation,
			effectClass: identity.effectClass,
			recipients: 1,
		},
		frozenArgs: args,
		ttlSeconds: options?.ttlSeconds ?? 3600,
	});
	return { id: created.id, args, identity };
}
const row = async (id: string) =>
	(await owner`SELECT * FROM gw_tool_approval WHERE id=${id}`)[0];
const checks: string[] = [];
const reds: string[] = [];
// Council R2 F4 repair: one deferred run must surface every defect group, not
// only the first failing assertion. Each group records PASS or RED and the
// script exits nonzero when any group is RED. Groups that mutate security
// state (grants, principal enablement) must restore it in finally so a RED
// cannot poison later groups.
const attempt = async (name: string, fn: () => Promise<void>) => {
	try {
		await fn();
		checks.push(name);
		console.log(`PASS ${name}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		reds.push(`${name}: ${message}`);
		console.log(`RED ${name}: ${message}`);
	}
};
const spawnWorkers = async (count: number, id: string, hold = false) =>
	Promise.all(
		Array.from({ length: count }, (_, n) =>
			(async () => {
				const child = Bun.spawn(
					[process.execPath, import.meta.path, "claim-worker", id, `${n}`],
					{
						stdout: "pipe",
						stderr: "pipe",
						env: hold ? { ...process.env, WORKER_HOLD: "1" } : process.env,
					},
				);
				const text = await new Response(child.stdout).text();
				await child.exited;
				return text.trim();
			})(),
		),
	);
const holdWorker = async (id: string) => {
	const child = Bun.spawn(
		[process.execPath, import.meta.path, "claim-worker", id, "0"],
		{
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, WORKER_HOLD: "1" },
		},
	);
	const reader = child.stdout.getReader();
	const { value } = await reader.read();
	return { child, text: new TextDecoder().decode(value).trim() };
};
// DB-state barrier observation (council R2 F2): a pool is provably past
// candidate selection / queued on the global advisory lock once pg_locks shows
// it waiting. Hoisted from the claim-race group for reuse by reg-f* groups.
const waiting = async (name: string) => {
	for (let n = 0; n < 1000; n++) {
		const rows =
			await owner`SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name=${name} AND l.locktype='advisory' AND NOT l.granted`;
		if (rows.length) return;
	}
	throw new Error(`Missing DB lock barrier: ${name}`);
};
// Council R8 N1 regression support: hold a claim recheck open until the
// database itself observes the deadline — a bounded poll on the claim's own
// transaction connection, so the crossing is DB-observed rather than a
// guessed local sleep.
const dbPastExpiry = async (tx: Parameters<ClaimRecheck>[0], id: string) => {
	for (let n = 0; n < 500; n++) {
		const [obs] =
			await tx`SELECT (clock_timestamp() > expires_at) AS past FROM gw_tool_approval WHERE id=${id}`;
		if (obs && obs.past === true) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("DB never observed expiry within the bounded window");
};
try {
	await attempt(
		"enqueue-encrypts-frozen-args-separately-from-projection",
		async () => {
			const { id, args, identity } = await enqueue();
			assert.ok(isFixtureArgs(args), "default fixture args carry text+marker");
			const stored = await row(id);
			assert.equal(stored.state, "pending");
			assert.equal(stored.org, "alpha");
			assert.equal(stored.binding, identity.binding);
			assert.equal(stored.request_digest, identity.requestDigest);
			const envelope = String(stored.envelope);
			assert.ok(!envelope.includes(args.text));
			assert.ok(!envelope.includes(args.marker));
			assert.match(envelope, /"alg":"aes-256-gcm"/);
			assert.deepEqual(stored.projection, {
				operation: identity.operation,
				effectClass: identity.effectClass,
				recipients: 1,
			});
			assert.ok(new Date(stored.expires_at).getTime() > Date.now());
			const [audited] =
				await owner`SELECT kind,actor,subject,payload FROM gw_audit WHERE kind='tool.approval.enqueue' AND payload->>'approval'=${id}`;
			assert.equal(audited.actor, agent);
			assert.equal(audited.payload.run, String(stored.run_id));
			assert.ok(!JSON.stringify(audited).includes(args.text));
		},
	);
	await attempt("enqueue-bounds-payload-projection-ttl-context", async () => {
		const good = await enqueue();
		await rejects(
			approvals.enqueue({
				context: {
					org: "alpha",
					actor: agent,
					subject: agent,
					runId: crypto.randomUUID(),
					request: "bounds",
					trace: "",
				},
				identity: identityOf(frozenArgs()),
				projection: { operation: "resend-emails" },
				frozenArgs: { text: "x".repeat(4096) },
				ttlSeconds: 3600,
			}),
			"request_too_large",
		);
		await rejects(
			approvals.enqueue({
				context: {
					org: "alpha",
					actor: agent,
					subject: agent,
					runId: crypto.randomUUID(),
					request: "bounds",
					trace: "",
				},
				identity: identityOf(frozenArgs()),
				projection: { blob: "y".repeat(2048) },
				frozenArgs: { text: "ok" },
				ttlSeconds: 3600,
			}),
			"projection_too_large",
		);
		for (const ttlSeconds of [0, 86401, 1.5]) {
			await rejects(
				approvals.enqueue({
					context: {
						org: "alpha",
						actor: agent,
						subject: agent,
						runId: crypto.randomUUID(),
						request: "bounds",
						trace: "",
					},
					identity: identityOf(frozenArgs()),
					projection: { operation: "resend-emails" },
					frozenArgs: { text: "ok" },
					ttlSeconds,
				}),
				"invalid_ttl",
			);
		}
		await rejects(
			approvals.enqueue({
				context: {
					org: "alpha",
					actor: agent,
					subject: agent,
					runId: crypto.randomUUID(),
					request: "bounds",
					trace: "",
				},
				identity: { ...identityOf(frozenArgs()), binding: "not-hex" },
				projection: { operation: "resend-emails" },
				frozenArgs: { text: "ok" },
				ttlSeconds: 60,
			}),
			"invalid_context",
		);
		await rejects(
			approvals.decide(good.id, "alpha", agent, "accept"),
			"human_required",
		);
	});
	await attempt("human-only-decision-foreign-org-agent-refused", async () => {
		const { id } = await enqueue();
		await rejects(
			approvals.decide(id, "beta", humanBeta, "accept"),
			"not_found",
		);
		await rejects(
			approvals.decide(id, "alpha", agent, "accept"),
			"human_required",
		);
		await rejects(
			approvals.decide(id, "alpha", "no-such-human", "decline"),
			"human_required",
		);
		await approvals.decide(id, "alpha", human, "accept");
		assert.equal((await row(id)).state, "approved");
		await rejects(
			approvals.decide(id, "alpha", human, "accept"),
			"already_decided",
		);
		await rejects(
			approvals.decide(id, "alpha", human, "cancel"),
			"already_decided",
		);
	});
	await attempt(
		"reg-n2-decision-attempt-and-success-events-are-distinct",
		async () => {
			for (const action of ["accept", "decline", "cancel"] as const) {
				const { id } = await enqueue();
				await approvals.decide(id, "alpha", human, action);
				const events =
					await owner`SELECT kind,payload FROM gw_audit WHERE payload->>'approval'=${id} AND kind LIKE 'tool.approval.%' ORDER BY seq`;
				assert.deepEqual(
					events.map((event) => event.kind),
					[
						"tool.approval.enqueue",
						"tool.approval.decision_attempt",
						`tool.approval.${action}`,
					],
				);
				assert.equal(events[1].payload.action, action);
				assert.equal(events[1].payload.human, human);
				assert.equal(events[2].payload.human, human);
				assert.equal(
					(await row(id)).state,
					action === "accept"
						? "approved"
						: action === "decline"
							? "declined"
							: "cancelled",
				);
			}
		},
	);
	await attempt(
		"reg-n2-success-audit-denial-rolls-back-attempt-and-decision",
		async () => {
			await owner.unsafe(
				`CREATE FUNCTION fixture_deny_decision_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind IN ('tool.approval.accept','tool.approval.decline','tool.approval.cancel') THEN RAISE EXCEPTION 'fixture decision success audit denied'; END IF; RETURN NEW; END $$`,
			);
			await owner.unsafe(
				"CREATE TRIGGER fixture_decision_success BEFORE INSERT ON gw_audit FOR EACH ROW EXECUTE FUNCTION fixture_deny_decision_success()",
			);
			try {
				for (const action of ["accept", "decline", "cancel"] as const) {
					const { id } = await enqueue();
					await rejects(
						approvals.decide(id, "alpha", human, action),
						"audit_denied",
					);
					const stored = await row(id);
					assert.equal(stored.state, "pending");
					assert.equal(stored.decided_by, null);
					const events =
						await owner`SELECT kind FROM gw_audit WHERE payload->>'approval'=${id}`;
					assert.deepEqual(
						events.map((event) => event.kind),
						["tool.approval.enqueue"],
					);
				}
			} finally {
				await owner.unsafe("DROP TRIGGER fixture_decision_success ON gw_audit");
				await owner.unsafe("DROP FUNCTION fixture_deny_decision_success()");
			}
		},
	);
	await attempt("single-claim-single-release-idempotent-report", async () => {
		const { id, args, identity } = await enqueue();
		await approvals.decide(id, "alpha", human, "accept");
		const payload = await approvals.claim(
			id,
			"alpha",
			"worker-main",
			async () => true,
		);
		assert.deepEqual(payload.args, args);
		assert.equal(payload.identity.operation, identity.operation);
		assert.equal(payload.identity.binding, identity.binding);
		assert.equal(payload.context.org, "alpha");
		assert.equal(payload.context.runId, (await row(id)).run_id);
		await rejects(
			approvals.claim(id, "alpha", "worker-main", async () => true),
			"not_claimable",
		);
		await approvals.report(id, "alpha", "worker-main", "succeeded");
		await approvals.report(id, "alpha", "worker-main", "succeeded");
		await rejects(
			approvals.report(id, "alpha", "worker-main", "failed"),
			"not_reportable",
		);
		await rejects(
			approvals.claim(id, "alpha", "worker-main", async () => true),
			"not_claimable",
		);
		assert.equal((await row(id)).state, "succeeded");
	});
	await attempt(
		"serialized-concurrent-connection-claim-exactly-one-winner",
		async () => {
			const raceA = postgres(runtimeDsn, {
				max: 1,
				onnotice: () => {},
				connection: { application_name: "ta-race-a" },
			});
			const raceB = postgres(runtimeDsn, {
				max: 1,
				onnotice: () => {},
				connection: { application_name: "ta-race-b" },
			});
			// Council R2 F4 repair: unlock must be visible to the sibling
			// finally, otherwise every run throws ReferenceError there even
			// after a successful race.
			let unlock: (() => void) | undefined;
			try {
				const { id } = await enqueue();
				await approvals.decide(id, "alpha", human, "accept");
				const gate = new Promise<void>((resolve) => {
					unlock = resolve;
				});
				let locked!: () => void;
				const ready = new Promise<void>((resolve) => {
					locked = resolve;
				});
				const blocker = owner.begin(async (tx) => {
					await tx`SELECT pg_advisory_xact_lock(719324821)`;
					locked();
					await gate;
				});
				await ready;
				const tryClaim = (name: string) =>
					createToolApprovals(
						gatewayStore(name === "a" ? raceA : raceB),
						fixtureKey(),
						bounds,
					)
						.claim(id, "alpha", `worker-race-${name}`, async () => true)
						.then(
							(value) => ({ value }),
							(error) => ({ error }),
						);
				const first = tryClaim("a");
				await waiting("ta-race-a");
				const second = tryClaim("b");
				await waiting("ta-race-b");
				// Prove the gate release was armed before invoking; the sibling
				// finally still guards cleanup with optional chaining.
				assert.ok(unlock !== undefined, "race gate release initialized");
				unlock();
				await blocker;
				const [one, two] = await Promise.all([first, second]);
				const failures = [one, two].filter((r) => "error" in r);
				const winners = [one, two].filter((r) => "value" in r);
				assert.equal(winners.length, 1, "exactly one claim winner");
				assert.equal(failures.length, 1);
				assert.equal(
					(failures[0] as { error: { reason: string } }).error.reason,
					"not_claimable",
				);
				assert.equal((await row(id)).state, "dispatching");
				// Test hygiene: leave the row terminal so later recovery groups
				// never see it as a stale dispatch candidate.
				const winnerRow = await row(id);
				await approvals.report(
					id,
					"alpha",
					String(winnerRow.claimed_by),
					"failed",
				);
				assert.equal((await row(id)).state, "failed");
			} finally {
				unlock?.();
				await raceA.end();
				await raceB.end();
			}
		},
	);
	await attempt(
		"cross-process-claim-contention-one-winner-owner-only-report",
		async () => {
			const { id, args } = await enqueue();
			assert.ok(isFixtureArgs(args), "default fixture args carry text+marker");
			await approvals.decide(id, "alpha", human, "accept");
			const outputs = await spawnWorkers(4, id);
			const claimed = outputs.filter((o) => o.startsWith("CLAIMED"));
			const denied = outputs.filter((o) => o.startsWith("DENIED"));
			assert.equal(claimed.length, 1, JSON.stringify(outputs));
			assert.equal(denied.length, 3);
			const claimedOutput = claimed[0];
			if (typeof claimedOutput !== "string") throw new Error("no claim output");
			assert.ok(claimedOutput.includes(args.marker));
			assert.ok(denied.every((o) => o.endsWith("not_claimable")));
			assert.equal((await row(id)).state, "dispatching");
			// Council R2 F4 repair: exercise the claim-owner gate while the row
			// is still dispatching. The old order reported a terminal outcome
			// first, so the wrong-worker report hit not_reportable before the
			// owner check and claim_owner was never proven.
			const winner = `worker-${outputs.indexOf(claimed[0])}`;
			await rejects(
				approvals.report(id, "alpha", "worker-other", "succeeded"),
				"claim_owner",
			);
			await approvals.report(id, "alpha", winner, "failed");
			assert.equal((await row(id)).state, "failed");
		},
	);
	// Council R2 F1 regression (expected RED until the production fix):
	// decide/claim refusal of an expired row must persist the expired
	// transition AND exactly one tool.approval.expired audit. Current source
	// throws inside sql.begin, rolling both writes back.
	await attempt("lease-expiry-blocks-decision-and-claim", async () => {
		const decideExpiry = await enqueue({ ttlSeconds: 1 });
		await new Promise((r) => setTimeout(r, 1300));
		await rejects(
			approvals.decide(decideExpiry.id, "alpha", human, "accept"),
			"expired",
		);
		assert.equal(
			(await row(decideExpiry.id)).state,
			"expired",
			"F1: decide refusal must persist the expired transition",
		);
		const [decideEvents] =
			await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.expired' AND payload->>'approval'=${decideExpiry.id}`;
		assert.equal(
			decideEvents.n,
			1,
			"F1: decide refusal must persist exactly one expiry audit",
		);
		const claimExpiry = await enqueue({ ttlSeconds: 1 });
		await approvals.decide(claimExpiry.id, "alpha", human, "accept");
		await new Promise((r) => setTimeout(r, 1300));
		await rejects(
			approvals.claim(claimExpiry.id, "alpha", "worker-x", async () => true),
			"expired",
		);
		assert.equal(
			(await row(claimExpiry.id)).state,
			"expired",
			"F1: claim refusal must persist the expired transition",
		);
		const [claimEvents] =
			await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.expired' AND payload->>'approval'=${claimExpiry.id}`;
		assert.equal(
			claimEvents.n,
			1,
			"F1: claim refusal must persist exactly one expiry audit",
		);
		await rejects(
			approvals.claim(claimExpiry.id, "alpha", "worker-x", async () => true),
			"not_claimable",
		);
	});
	await attempt("decline-and-cancel-block-claim", async () => {
		const declined = await enqueue();
		await approvals.decide(declined.id, "alpha", human, "decline");
		await rejects(
			approvals.claim(declined.id, "alpha", "worker-x", async () => true),
			"not_claimable",
		);
		const cancelled = await enqueue();
		await approvals.decide(cancelled.id, "alpha", human, "cancel");
		await rejects(
			approvals.claim(cancelled.id, "alpha", "worker-x", async () => true),
			"not_claimable",
		);
		assert.equal((await row(declined.id)).state, "declined");
		assert.equal((await row(cancelled.id)).state, "cancelled");
	});
	await attempt(
		"tampered-envelope-binding-wrong-key-fail-closed-no-release",
		async () => {
			const tamperedJson = await enqueue();
			await approvals.decide(tamperedJson.id, "alpha", human, "accept");
			await owner`UPDATE gw_tool_approval SET envelope='{"v":1,"alg":"aes-256-gcm","iv":"AAAA","tag":"AAAA","ct":"AAAA"}' WHERE id=${tamperedJson.id}`;
			await rejects(
				approvals.claim(tamperedJson.id, "alpha", "worker-x", async () => true),
				"integrity_failure",
			);
			const tamperedByte = await enqueue();
			await approvals.decide(tamperedByte.id, "alpha", human, "accept");
			await owner`UPDATE gw_tool_approval SET envelope=replace(envelope,'"ct":"','"ct":"X') WHERE id=${tamperedByte.id}`;
			await rejects(
				approvals.claim(tamperedByte.id, "alpha", "worker-x", async () => true),
				"integrity_failure",
			);
			const tamperedBinding = await enqueue();
			await approvals.decide(tamperedBinding.id, "alpha", human, "accept");
			await owner`UPDATE gw_tool_approval SET binding=${"0".repeat(64)} WHERE id=${tamperedBinding.id}`;
			await rejects(
				approvals.claim(
					tamperedBinding.id,
					"alpha",
					"worker-x",
					async () => true,
				),
				"integrity_failure",
			);
			const wrongKey = createToolApprovals(
				store,
				createHash("sha256").update("different-fixture-key").digest(),
				bounds,
			);
			const wrongKeyRow = await enqueue();
			await approvals.decide(wrongKeyRow.id, "alpha", human, "accept");
			await rejects(
				wrongKey.claim(wrongKeyRow.id, "alpha", "worker-x", async () => true),
				"integrity_failure",
			);
			for (const id of [
				tamperedJson.id,
				tamperedByte.id,
				tamperedBinding.id,
				wrongKeyRow.id,
			])
				assert.equal(
					(await row(id)).state,
					"approved",
					`${id} must stay approved`,
				);
		},
	);
	// Council R2 F4 label narrowing: this exercises the recheck SEAM (runs in
	// the claim transaction, fail closed, row stays approved) with a
	// subject-permission probe only. It does NOT prove credential, delegation,
	// run-binding or operation-policy revalidation — the production recheck
	// remains an integration obligation.
	await attempt(
		"recheck-false-fails-closed-revoked-subject-blocks-release",
		async () => {
			const { id } = await enqueue();
			await approvals.decide(id, "alpha", human, "accept");
			const currentRights = async (
				tx: Parameters<
					Parameters<ReturnType<typeof createToolApprovals>["claim"]>[3]
				>[0],
				record: { subject: string },
			) => {
				const [p] =
					await tx`SELECT permissions FROM gw_principal WHERE id=${record.subject} AND enabled=true`;
				return !!p && (p.permissions as string[]).includes("mcp:status");
			};
			await owner`UPDATE gw_principal SET enabled=false WHERE id=${agent}`;
			try {
				await rejects(
					approvals.claim(id, "alpha", "worker-x", currentRights),
					"claim_denied",
				);
				assert.equal((await row(id)).state, "approved");
			} finally {
				await owner`UPDATE gw_principal SET enabled=true WHERE id=${agent}`;
			}
			const payload = await approvals.claim(
				id,
				"alpha",
				"worker-x",
				currentRights,
			);
			assert.ok(payload.args);
			await approvals.report(id, "alpha", "worker-x", "succeeded");
		},
	);
	// Council R2 F1 regression (expected RED until the production fix): the
	// claim_denied audit must persist after a refused recheck while the row
	// stays approved. Current source appends the audit and then throws inside
	// sql.begin, rolling the audit back.
	await attempt(
		"reg-f1-claim-denied-audit-persists-row-stays-approved",
		async () => {
			const { id } = await enqueue();
			await approvals.decide(id, "alpha", human, "accept");
			await rejects(
				approvals.claim(id, "alpha", "worker-cd", async () => false),
				"claim_denied",
			);
			assert.equal((await row(id)).state, "approved");
			const [event] =
				await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.claim_denied' AND payload->>'approval'=${id}`;
			assert.equal(
				event.n,
				1,
				"F1: claim_denied audit must persist after the refused recheck",
			);
		},
	);
	// Council R2 F4 coverage completion: audit-insert denial must roll back
	// report and BOTH recovery loops (expiry + stale-dispatch classification),
	// not only enqueue/decide/claim.
	await attempt(
		"audit-denial-rolls-back-enqueue-decide-claim-report-recover",
		async () => {
			const before = await enqueue();
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				const context = {
					org: "alpha",
					actor: agent,
					subject: agent,
					runId: crypto.randomUUID(),
					request: "audit-fail-enqueue",
					trace: "",
				};
				await rejects(
					approvals.enqueue({
						context,
						identity: identityOf(frozenArgs()),
						projection: { operation: "resend-emails" },
						frozenArgs: { text: "ok" },
						ttlSeconds: 60,
					}),
					"audit_denied",
				);
				assert.equal(
					(
						await owner`SELECT count(*)::int AS n FROM gw_tool_approval WHERE run_id=${context.runId}`
					)[0].n,
					0,
					"failed enqueue must not persist a row",
				);
				await rejects(
					approvals.decide(before.id, "alpha", human, "accept"),
					"audit_denied",
				);
				assert.equal((await row(before.id)).state, "pending");
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
			const decided = await enqueue();
			await approvals.decide(decided.id, "alpha", human, "accept");
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				await rejects(
					approvals.claim(decided.id, "alpha", "worker-x", async () => true),
					"audit_denied",
				);
				assert.equal((await row(decided.id)).state, "approved");
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
			// report rollback
			const reporting = await enqueue();
			await approvals.decide(reporting.id, "alpha", human, "accept");
			await approvals.claim(
				reporting.id,
				"alpha",
				"worker-ar",
				async () => true,
			);
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				await rejects(
					approvals.report(reporting.id, "alpha", "worker-ar", "succeeded"),
					"audit_denied",
				);
				assert.equal(
					(await row(reporting.id)).state,
					"dispatching",
					"report must not persist without its audit",
				);
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
			await approvals.report(reporting.id, "alpha", "worker-ar", "succeeded");
			// recover (expiry loop) rollback. Remove other expired candidates
			// first so the denial provably originates from this group's row.
			await owner`DELETE FROM gw_tool_approval WHERE state IN ('pending','approved') AND expires_at<=clock_timestamp()`;
			const expiring = await enqueue({ ttlSeconds: 1 });
			await new Promise((r) => setTimeout(r, 1300));
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				await rejects(approvals.recover(), "audit_denied");
				assert.equal(
					(await row(expiring.id)).state,
					"pending",
					"recovery must not expire a row without its audit",
				);
				const [expiredEvent] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.expired' AND payload->>'approval'=${expiring.id}`;
				assert.equal(expiredEvent.n, 0);
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
			// recover (stale-dispatch loop) rollback
			await owner`DELETE FROM gw_tool_approval WHERE state IN ('pending','approved') AND expires_at<=clock_timestamp()`;
			const staleAr = await enqueue();
			await approvals.decide(staleAr.id, "alpha", human, "accept");
			await tightApprovals.claim(
				staleAr.id,
				"alpha",
				"worker-ars",
				async () => true,
			);
			await new Promise((r) => setTimeout(r, 1300));
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				await rejects(tightApprovals.recover(), "audit_denied");
				assert.equal(
					(await row(staleAr.id)).state,
					"dispatching",
					"recovery must not classify a row without its audit",
				);
				const [unknownEvent] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.outcome_unknown' AND payload->>'approval'=${staleAr.id}`;
				assert.equal(unknownEvent.n, 0);
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
			await approvals.report(staleAr.id, "alpha", "worker-ars", "failed");
		},
	);
	await attempt(
		"crash-recovery-classifies-unknown-never-redispatches",
		async () => {
			const { id } = await enqueue();
			await approvals.decide(id, "alpha", human, "accept");
			const holder = await holdWorker(id);
			assert.match(holder.text, /^CLAIMED /);
			assert.equal((await row(id)).state, "dispatching");
			holder.child.kill("SIGKILL");
			await holder.child.exited;
			await approvals.recover();
			assert.equal(
				(await row(id)).state,
				"dispatching",
				"fresh claim must not be classified",
			);
			await new Promise((r) => setTimeout(r, 3300));
			await approvals.recover();
			assert.equal((await row(id)).state, "outcome_unknown");
			const [unknown] =
				await owner`SELECT payload FROM gw_audit WHERE kind='tool.approval.outcome_unknown' AND payload->>'approval'=${id}`;
			assert.equal(unknown.payload.externalEffect, "unknown");
			await rejects(
				approvals.claim(id, "alpha", "worker-y", async () => true),
				"not_claimable",
			);
			await rejects(
				approvals.report(id, "alpha", "worker-0", "succeeded"),
				"not_reportable",
			);
			await approvals.recover();
			const events =
				await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.outcome_unknown' AND payload->>'approval'=${id}`;
			assert.equal(events[0].n, 1);
		},
	);
	// Council R2 F2 regression (expected RED until the production fix):
	// recovery selects candidates outside the advisory-locked transaction, so
	// a report committing in that window is audited outcome_unknown even
	// though its conditional UPDATE transitions zero rows. Deterministic via
	// advisory-lock queue order: holder -> report tx -> recovery tx (PostgreSQL
	// grants same-lock exclusive waiters FIFO), observed through pg_locks
	// before the holder releases. All barriers release in finally.
	await attempt(
		"reg-f2-reported-row-never-gains-contradictory-unknown-audit",
		async () => {
			const { id } = await enqueue();
			await approvals.decide(id, "alpha", human, "accept");
			await tightApprovals.claim(id, "alpha", "worker-f2a", async () => true);
			await new Promise((r) => setTimeout(r, 1300));
			// Earlier groups' expired rows must not be recovery candidates:
			// their per-row transactions would consume the barrier window and
			// defer this row's candidate selection past the release.
			await owner`DELETE FROM gw_tool_approval WHERE state IN ('pending','approved') AND expires_at<=clock_timestamp()`;
			const rpt = postgres(runtimeDsn, {
				max: 1,
				onnotice: () => {},
				connection: { application_name: "ta-f2a-rpt" },
			});
			const rec = postgres(runtimeDsn, {
				max: 1,
				onnotice: () => {},
				connection: { application_name: "ta-f2a-rec" },
			});
			let release: (() => void) | undefined;
			try {
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				let holderReady!: () => void;
				const held = new Promise<void>((resolve) => {
					holderReady = resolve;
				});
				const holder = owner.begin(async (tx) => {
					await tx`SELECT pg_advisory_xact_lock(719324821)`;
					holderReady();
					await gate;
				});
				await held;
				const reportDone = createToolApprovals(
					gatewayStore(rpt),
					fixtureKey(),
					bounds,
				)
					.report(id, "alpha", "worker-f2a", "succeeded")
					.then(
						(value) => ({ value }),
						(error) => ({ error }),
					);
				await waiting("ta-f2a-rpt");
				const recoverDone = createToolApprovals(
					gatewayStore(rec),
					fixtureKey(),
					tightLease,
				)
					.recover()
					.then(
						(value) => ({ value }),
						(error) => ({ error }),
					);
				await waiting("ta-f2a-rec");
				// Prove the barrier release was armed before invoking; the
				// sibling finally still guards cleanup with optional chaining.
				assert.ok(release !== undefined, "F2a barrier release initialized");
				release();
				await holder;
				const [reported, recovered] = await Promise.all([
					reportDone,
					recoverDone,
				]);
				assert.ok(
					!("error" in reported),
					`report must win the queue: ${JSON.stringify(reported)}`,
				);
				assert.ok(
					!("error" in recovered),
					`recover must resolve: ${JSON.stringify(recovered)}`,
				);
				assert.equal((await row(id)).state, "succeeded");
				const [unknown] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.outcome_unknown' AND payload->>'approval'=${id}`;
				assert.equal(
					unknown.n,
					0,
					"F2: a reported row must never gain an outcome_unknown audit",
				);
			} finally {
				release?.();
				await rpt.end();
				await rec.end();
			}
		},
	);
	// Council R2 F2 regression (expected RED until the production fix): two
	// concurrent recoveries over the same stale candidate must record exactly
	// one outcome_unknown event. Current source appends the audit before the
	// conditional UPDATE in both, duplicating the event.
	await attempt(
		"reg-f2-concurrent-recovery-records-single-unknown-event",
		async () => {
			const { id } = await enqueue();
			await approvals.decide(id, "alpha", human, "accept");
			await tightApprovals.claim(id, "alpha", "worker-f2b", async () => true);
			await new Promise((r) => setTimeout(r, 1300));
			await owner`DELETE FROM gw_tool_approval WHERE state IN ('pending','approved') AND expires_at<=clock_timestamp()`;
			const recA = postgres(runtimeDsn, {
				max: 1,
				onnotice: () => {},
				connection: { application_name: "ta-f2b-a" },
			});
			const recB = postgres(runtimeDsn, {
				max: 1,
				onnotice: () => {},
				connection: { application_name: "ta-f2b-b" },
			});
			let release: (() => void) | undefined;
			try {
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				let holderReady!: () => void;
				const held = new Promise<void>((resolve) => {
					holderReady = resolve;
				});
				const holder = owner.begin(async (tx) => {
					await tx`SELECT pg_advisory_xact_lock(719324821)`;
					holderReady();
					await gate;
				});
				await held;
				const recoveryA = createToolApprovals(
					gatewayStore(recA),
					fixtureKey(),
					tightLease,
				)
					.recover()
					.then(
						(value) => ({ value }),
						(error) => ({ error }),
					);
				await waiting("ta-f2b-a");
				const recoveryB = createToolApprovals(
					gatewayStore(recB),
					fixtureKey(),
					tightLease,
				)
					.recover()
					.then(
						(value) => ({ value }),
						(error) => ({ error }),
					);
				await waiting("ta-f2b-b");
				// Prove the barrier release was armed before invoking; the
				// sibling finally still guards cleanup with optional chaining.
				assert.ok(release !== undefined, "F2b barrier release initialized");
				release();
				await holder;
				const [a, b] = await Promise.all([recoveryA, recoveryB]);
				assert.ok(
					!("error" in a),
					`recovery A must resolve: ${JSON.stringify(a)}`,
				);
				assert.ok(
					!("error" in b),
					`recovery B must resolve: ${JSON.stringify(b)}`,
				);
				assert.equal((await row(id)).state, "outcome_unknown");
				const [events] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.outcome_unknown' AND payload->>'approval'=${id}`;
				assert.equal(
					events.n,
					1,
					"F2: concurrent recoveries must not duplicate the unknown event",
				);
			} finally {
				release?.();
				await recA.end();
				await recB.end();
			}
		},
	);
	// Council R2 F3 regression (expected RED until the production fix): the
	// same-outcome no-op runs before the claimed_by check, so a different
	// worker silently acks another worker's terminal result. Same-owner replay
	// must stay an idempotent no-op.
	await attempt("reg-f3-terminal-replay-requires-claim-owner", async () => {
		const { id } = await enqueue();
		await approvals.decide(id, "alpha", human, "accept");
		await approvals.claim(id, "alpha", "worker-f3", async () => true);
		await approvals.report(id, "alpha", "worker-f3", "succeeded");
		await approvals.report(id, "alpha", "worker-f3", "succeeded");
		await rejects(
			approvals.report(id, "alpha", "worker-other", "succeeded"),
			"claim_owner",
		);
		assert.equal((await row(id)).state, "succeeded");
	});
	await attempt("reg-f3-unknown-replay-requires-claim-owner", async () => {
		const { id } = await enqueue();
		await approvals.decide(id, "alpha", human, "accept");
		await tightApprovals.claim(id, "alpha", "worker-f3u", async () => true);
		await new Promise((r) => setTimeout(r, 1300));
		await tightApprovals.recover();
		assert.equal((await row(id)).state, "outcome_unknown");
		await tightApprovals.report(id, "alpha", "worker-f3u", "outcome_unknown");
		await rejects(
			tightApprovals.report(id, "alpha", "worker-other", "outcome_unknown"),
			"claim_owner",
		);
	});
	// Council R8 N1 regression (expected RED until the production fix): claim's
	// winning UPDATE lacks a DB-time expiry guard, so a recheck held past the
	// deadline can still commit dispatching and release the payload. The recheck
	// below releases ONLY once the database observes its own clock past
	// expires_at, then returns true — the authority callback is legitimate.
	await attempt(
		"reg-n1-held-recheck-crossing-expiry-refuses-and-releases-nothing",
		async () => {
			const { id } = await enqueue({ ttlSeconds: 2 });
			await approvals.decide(id, "alpha", human, "accept");
			await rejects(
				approvals.claim(id, "alpha", "worker-n1", async (tx) => {
					await dbPastExpiry(tx, id);
					return true;
				}),
				"expired",
			);
			assert.equal(
				(await row(id)).state,
				"expired",
				"N1: refused claim must leave the row durably expired",
			);
			const [expiryEvents] =
				await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.expired' AND payload->>'approval'=${id}`;
			assert.equal(expiryEvents.n, 1, "N1: exactly one expiry event");
			const [claimEvents] =
				await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.claim' AND payload->>'approval'=${id}`;
			assert.equal(
				claimEvents.n,
				0,
				"N1: zero claim events — no payload release",
			);
		},
	);
	// Council R8 N1 coverage completion (expected GREEN on fixed bytes too): the
	// committed-refusal expiry path must keep genuine audit-failure rollback —
	// an audit insert denied while the recheck crosses the deadline rolls the
	// expiry transition back and releases nothing. Grant restored in finally.
	await attempt(
		"reg-n1-expiry-crossing-audit-denial-rolls-back-nothing-released",
		async () => {
			const { id } = await enqueue({ ttlSeconds: 2 });
			await approvals.decide(id, "alpha", human, "accept");
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				await rejects(
					approvals.claim(id, "alpha", "worker-n1b", async (tx) => {
						await dbPastExpiry(tx, id);
						return true;
					}),
					"audit_denied",
				);
				assert.equal(
					(await row(id)).state,
					"approved",
					"N1: audit denial must roll the expiry transition back",
				);
				const [events] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE payload->>'approval'=${id} AND kind IN ('tool.approval.expired','tool.approval.claim')`;
				assert.equal(
					events.n,
					0,
					"N1: no expiry or claim event without its audit",
				);
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
		},
	);
	// Council R8 N1 regression (expected RED until the production fix): decide's
	// acceptance UPDATE runs after an awaited audit append with no DB-time
	// guard, so a decision whose audit wait crosses the deadline is still
	// accepted. The wrapped store's audit gate releases ONLY once the database
	// observes expiry (owner-side poll — the decide tx holds the global advisory
	// lock, so the watch must not take it). Fixed shape: the attempted-action
	// audit may stand as the record of the attempt, but the guarded acceptance
	// UPDATE must miss, persist the F1 expired transition, and refuse.
	await attempt(
		"reg-n1-decide-audit-wait-window-never-accepts-after-deadline",
		async () => {
			const { id } = await enqueue({ ttlSeconds: 2 });
			let release: (() => void) | undefined;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			let dbObserved = false;
			let auditEntered = false;
			const watch = (async () => {
				for (let n = 0; n < 500; n++) {
					const [obs] =
						await owner`SELECT (clock_timestamp() > expires_at) AS past FROM gw_tool_approval WHERE id=${id}`;
					if (obs && obs.past === true) {
						dbObserved = true;
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 20));
				}
				release?.();
			})();
			const slowAuditStore: GatewayStore = {
				...store,
				audit: async (
					...args: Parameters<GatewayStore["audit"]>
				): Promise<void> => {
					auditEntered = true;
					await gate;
					return store.audit(...args);
				},
			};
			const slowAuditApprovals = createToolApprovals(
				slowAuditStore,
				fixtureKey(),
				bounds,
			);
			try {
				await rejects(
					slowAuditApprovals.decide(id, "alpha", human, "accept"),
					"expired",
				);
				assert.ok(auditEntered, "decision entered the held audit path");
				assert.ok(dbObserved, "audit gate released only on DB-observed expiry");
				const attempts =
					await owner`SELECT payload FROM gw_audit WHERE kind='tool.approval.decision_attempt' AND payload->>'approval'=${id}`;
				assert.equal(attempts.length, 1);
				assert.equal(attempts[0].payload.action, "accept");
				assert.equal(attempts[0].payload.human, human);
				assert.equal(
					(await row(id)).state,
					"expired",
					"N1: post-deadline decision must leave the row expired",
				);
				const [acceptEvents] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.accept' AND payload->>'approval'=${id}`;
				assert.equal(
					acceptEvents.n,
					0,
					"N2: an expired attempt is not a successful acceptance",
				);
				const [expiryEvents] =
					await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='tool.approval.expired' AND payload->>'approval'=${id}`;
				assert.equal(
					expiryEvents.n,
					1,
					"N1: exactly one expiry event after the wait window",
				);
			} finally {
				release?.();
				await watch;
			}
		},
	);
	// Council R8 N1 regression (expected RED until the production fix): the lazy
	// expiry prechecks consult the application clock, so a skewed app clock
	// expires a row the database has not expired. The winning DB-time predicate
	// is the authority; this group pins the lazy prechecks to it.
	await attempt(
		"reg-n1-skewed-app-clock-cannot-preexpire-live-row",
		async () => {
			const { id } = await enqueue({ ttlSeconds: 120 });
			await approvals.decide(id, "alpha", human, "accept");
			const stored = await row(id);
			const realNow = Date.now;
			try {
				Date.now = () => new Date(stored.expires_at).getTime() + 5000;
				const outcome = await approvals
					.claim(id, "alpha", "worker-n1s", async () => true)
					.then(
						(value) => ({ value }),
						(error) => ({ error }),
					);
				assert.ok(
					!("error" in outcome),
					`N1: app clock must not expire a DB-live row: ${JSON.stringify(outcome)}`,
				);
				assert.equal((await row(id)).state, "dispatching");
				await approvals.report(id, "alpha", "worker-n1s", "failed");
			} finally {
				Date.now = realNow;
			}
		},
	);
	// Council R2 pagination note: the cursor is created_at-only. Rows sharing
	// a timestamp can be skipped between pages, so this group proves bounded
	// tenant-scoped projection only — NOT tied-timestamp completeness. A
	// (created_at,id) keyset fix is owed before the approval inbox ships.
	await attempt(
		"bounded-queue-detail-projections-tenant-isolated",
		async () => {
			for (let n = 0; n < 3; n++) await enqueue();
			const page = await approvals.queue("alpha", { limit: 2 });
			assert.equal(page.rows.length, 2);
			assert.ok(page.next);
			const next = await approvals.queue("alpha", {
				limit: 2,
				before: page.next,
			});
			assert.ok(next.rows.length >= 1);
			assert.ok(
				page.rows.every((r) => ["pending", "approved"].includes(r.state)),
			);
			assert.ok(page.rows.every((r) => !("envelope" in r)));
			const empty = await approvals.queue("beta", { limit: 10 });
			assert.equal(empty.rows.length, 0);
			const target = page.rows[0];
			if (!target) throw new Error("empty page");
			const full = await approvals.detail("alpha", target.id);
			assert.equal(full.state, target.state);
			assert.ok(!("envelope" in full));
			await rejects(approvals.detail("beta", target.id), "not_found");
			await rejects(approvals.queue("alpha", { limit: 0 }), "invalid_page");
			await rejects(approvals.queue("alpha", { limit: 51 }), "invalid_page");
		},
	);
	await attempt("bounded-pending-queue-capacity", async () => {
		const first = await enqueue({ bounds: smallBounds, org: "beta" });
		await enqueue({ bounds: smallBounds, org: "beta" });
		await rejects(
			enqueue({ bounds: smallBounds, org: "beta" }),
			"approval_capacity",
		);
		assert.equal((await row(first.id)).state, "pending");
	});
	await attempt("no-args-or-secrets-in-audit-or-projection", async () => {
		const dump = JSON.stringify(
			await owner`SELECT kind,actor,subject,payload FROM gw_audit WHERE org='alpha'`,
		);
		assert.ok(!dump.includes("fixture-frozen-args-never-leak"));
		assert.ok(!dump.includes("MARK-"));
		const rows = JSON.stringify(
			await owner`SELECT projection,state FROM gw_tool_approval WHERE org='alpha'`,
		);
		assert.ok(!rows.includes("fixture-frozen-args-never-leak"));
	});
	if (reds.length) {
		console.log(
			`TOOL APPROVAL CHECK RED ${reds.length} of ${checks.length + reds.length} groups`,
		);
		for (const red of reds) console.log(`RED-GROUP ${red}`);
		process.exitCode = 1;
	} else {
		console.log(`TOOL APPROVAL CHECK PASSED ${checks.length} groups`);
	}
} finally {
	await sql.end();
	await owner.end();
}
