import { createHash, randomBytes } from "node:crypto";
import { Effect, Metric } from "effect";
import type { Sql, TransactionSql } from "postgres";
import {
	type AgentsError,
	BadRequest,
	Conflict,
	isAgentsError,
	NotFound,
	Unauthenticated,
} from "./errors";
import {
	type CreateAgent,
	type CreateTask,
	type FailureCode,
	type Finish,
	type Item,
	isRetryable,
	type McpServer,
	type TaskDescriptor,
	type TaskStatus,
} from "./protocol";

export const PLUGIN = "agents";
export const DEFAULT_LEASE_MS = 60_000;

const tasksClaimed = Metric.counter("stellarc_agent_tasks_claimed_total");
const tasksFinished = Metric.counter("stellarc_agent_tasks_finished_total");

export interface NodeRow {
	readonly id: string;
	readonly org: string;
	readonly name: string;
	readonly harnesses: ReadonlyArray<string>;
	readonly version: string | null;
	readonly lastSeenAt: string | null;
	readonly createdAt: string;
}
export interface AgentRow {
	readonly id: string;
	readonly org: string;
	readonly name: string;
	readonly nodeId: string;
	readonly harness: string;
	readonly model: string | null;
	readonly instructions: string;
	readonly mcpServers: ReadonlyArray<McpServer>;
	readonly createdAt: string;
}
export interface TaskRow {
	readonly id: string;
	readonly org: string;
	readonly agentId: string;
	readonly subjectRef: string | null;
	readonly prompt: string;
	readonly status: TaskStatus;
	readonly attempt: number;
	readonly maxAttempts: number;
	readonly nodeId: string | null;
	readonly leaseUntil: string | null;
	readonly stopReason: string | null;
	readonly failureCode: FailureCode | null;
	readonly failureMessage: string | null;
	readonly nativeSessionId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}
export interface ItemRow {
	readonly attempt: number;
	readonly seq: number;
	readonly kind: string;
	readonly body: unknown;
	readonly occurredAt: string;
}

const iso = (v: unknown) =>
	v == null ? null : v instanceof Date ? v.toISOString() : String(v);
// biome-ignore lint/suspicious/noExplicitAny: postgres.js row shape
type Row = Record<string, any>;
const node = (r: Row): NodeRow => ({
	id: r.id,
	org: r.org,
	name: r.name,
	harnesses: r.harnesses ?? [],
	version: r.version ?? null,
	lastSeenAt: iso(r.last_seen_at),
	createdAt: iso(r.created_at) as string,
});
const agent = (r: Row): AgentRow => ({
	id: r.id,
	org: r.org,
	name: r.name,
	nodeId: r.node_id,
	harness: r.harness,
	model: r.model ?? null,
	instructions: r.instructions,
	mcpServers: r.mcp_servers ?? [],
	createdAt: iso(r.created_at) as string,
});
const task = (r: Row): TaskRow => ({
	id: r.id,
	org: r.org,
	agentId: r.agent_id,
	subjectRef: r.subject_ref ?? null,
	prompt: r.prompt,
	status: r.status,
	attempt: r.attempt,
	maxAttempts: r.max_attempts,
	nodeId: r.node_id ?? null,
	leaseUntil: iso(r.lease_until),
	stopReason: r.stop_reason ?? null,
	failureCode: r.failure_code ?? null,
	failureMessage: r.failure_message ?? null,
	nativeSessionId: r.native_session_id ?? null,
	createdAt: iso(r.created_at) as string,
	updatedAt: iso(r.updated_at) as string,
});

const newId = (prefix: string) =>
	`${prefix}_${randomBytes(12).toString("hex")}`;
export const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

/** Append events to the org log inside the caller's transaction (D10). */
async function appendEvents(
	tx: TransactionSql,
	org: string,
	actor: string,
	events: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>,
) {
	if (events.length === 0) return;
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq=seq+${events.length} WHERE org=${org} RETURNING seq::text`;
	const [txn] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	let seq = BigInt(counter.seq) - BigInt(events.length);
	for (const event of events) {
		seq += 1n;
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
      VALUES (${org},${seq.toString()},${`${PLUGIN}:${event.type}`},${actor},${tx.json(event.payload as never)},1,${txn.txid})`;
	}
}

/** Run a transactional body as a span; AgentsError failures pass through typed. */
const txn = <A>(
	sql: Sql,
	name: string,
	body: (tx: TransactionSql) => Promise<A>,
): Effect.Effect<A, AgentsError | Error> =>
	Effect.tryPromise({
		try: () => sql.begin((tx) => body(tx)) as Promise<A>,
		catch: (cause) =>
			isAgentsError(cause)
				? cause
				: cause instanceof Error
					? cause
					: new Error(String(cause)),
	}).pipe(Effect.withSpan(`Agents.${name}`));

export class AgentStore {
	constructor(
		private readonly sql: Sql,
		private readonly leaseMs = DEFAULT_LEASE_MS,
	) {}

	// ── nodes ────────────────────────────────────────────────────────────────
	createNode(org: string, actor: string, name: string) {
		return txn(this.sql, "createNode", async (tx) => {
			const token = `stln_${randomBytes(32).toString("base64url")}`;
			const id = newId("node");
			const [existing] =
				await tx`SELECT 1 FROM agent_node WHERE org=${org} AND name=${name}`;
			if (existing)
				throw new Conflict({ message: `Node "${name}" already exists` });
			const [row] =
				await tx`INSERT INTO agent_node(id,org,name,token_hash,created_by)
        VALUES (${id},${org},${name},${hashToken(token)},${actor}) RETURNING *`;
			await appendEvents(tx, org, actor, [
				{ type: "node-registered", payload: { id, name } },
			]);
			return { node: node(row), token };
		});
	}

	listNodes(org: string) {
		return Effect.tryPromise(
			() =>
				this
					.sql`SELECT * FROM agent_node WHERE org=${org} AND revoked_at IS NULL ORDER BY created_at`,
		).pipe(
			Effect.map((rows) => rows.map(node)),
			Effect.withSpan("Agents.listNodes"),
		);
	}

	authenticateNode(token: string | undefined) {
		const sql = this.sql;
		return Effect.gen(function* () {
			if (!token)
				return yield* Effect.fail(
					new Unauthenticated({ message: "Node token required" }),
				);
			const rows = yield* Effect.tryPromise(
				() =>
					sql`SELECT * FROM agent_node WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL`,
			);
			if (rows.length === 0)
				return yield* Effect.fail(
					new Unauthenticated({ message: "Invalid node token" }),
				);
			return node(rows[0]);
		}).pipe(Effect.withSpan("Agents.authenticateNode"));
	}

	hello(n: NodeRow, version: string, harnesses: ReadonlyArray<string>) {
		return txn(this.sql, "hello", async (tx) => {
			const [row] = await tx`UPDATE agent_node SET version=${version},
        harnesses=${tx.json([...harnesses])}, last_seen_at=now() WHERE id=${n.id} RETURNING *`;
			await appendEvents(tx, n.org, `node:${n.id}`, [
				{ type: "node-hello", payload: { id: n.id, version, harnesses } },
			]);
			return node(row);
		});
	}

	// ── agents ───────────────────────────────────────────────────────────────
	createAgent(org: string, actor: string, input: CreateAgent) {
		return txn(this.sql, "createAgent", async (tx) => {
			const [n] =
				await tx`SELECT * FROM agent_node WHERE id=${input.nodeId} AND org=${org} AND revoked_at IS NULL`;
			if (!n) throw new NotFound({ message: "Node not found" });
			const harnesses: string[] = n.harnesses ?? [];
			if (!harnesses.includes(input.harness))
				throw new BadRequest({
					message: `Node "${n.name}" does not offer harness "${input.harness}" (offers: ${harnesses.join(", ") || "none — node has not connected"})`,
				});
			const [dup] =
				await tx`SELECT 1 FROM agent WHERE org=${org} AND name=${input.name}`;
			if (dup)
				throw new Conflict({ message: `Agent "${input.name}" already exists` });
			const id = newId("agt");
			const [row] =
				await tx`INSERT INTO agent(id,org,name,node_id,harness,model,instructions,mcp_servers,created_by)
        VALUES (${id},${org},${input.name},${input.nodeId},${input.harness},${input.model ?? null},
        ${input.instructions},${tx.json(input.mcpServers as never)},${actor}) RETURNING *`;
			await appendEvents(tx, org, actor, [
				{
					type: "agent-created",
					payload: {
						id,
						name: input.name,
						nodeId: input.nodeId,
						harness: input.harness,
						model: input.model ?? null,
					},
				},
			]);
			return agent(row);
		});
	}

	listAgents(org: string) {
		return Effect.tryPromise(
			() =>
				this
					.sql`SELECT * FROM agent WHERE org=${org} AND archived_at IS NULL ORDER BY created_at`,
		).pipe(
			Effect.map((rows) => rows.map(agent)),
			Effect.withSpan("Agents.listAgents"),
		);
	}

	// ── tasks (operator side) ────────────────────────────────────────────────
	createTask(org: string, actor: string, input: CreateTask) {
		return txn(this.sql, "createTask", async (tx) => {
			const [a] =
				await tx`SELECT id FROM agent WHERE id=${input.agentId} AND org=${org} AND archived_at IS NULL`;
			if (!a) throw new NotFound({ message: "Agent not found" });
			const id = newId("task");
			const [row] =
				await tx`INSERT INTO agent_task(id,org,agent_id,subject_ref,prompt,max_attempts,created_by)
        VALUES (${id},${org},${input.agentId},${input.subjectRef ?? null},${input.prompt},${input.maxAttempts ?? 3},${actor})
        RETURNING *`;
			await appendEvents(tx, org, actor, [
				{
					type: "task-created",
					payload: {
						id,
						agentId: input.agentId,
						subjectRef: input.subjectRef ?? null,
					},
				},
			]);
			await tx`SELECT pg_notify('stellarc_agent_task', ${input.agentId})`;
			return task(row);
		});
	}

	getTask(org: string, id: string) {
		const sql = this.sql;
		return Effect.gen(function* () {
			const rows = yield* Effect.tryPromise(
				() => sql`SELECT * FROM agent_task WHERE id=${id} AND org=${org}`,
			);
			if (rows.length === 0)
				return yield* Effect.fail(new NotFound({ message: "Task not found" }));
			const items = yield* Effect.tryPromise(
				() =>
					sql`SELECT attempt,seq,kind,body,occurred_at FROM agent_task_item WHERE task_id=${id} ORDER BY attempt,seq`,
			);
			return {
				task: task(rows[0]),
				items: items.map(
					(r): ItemRow => ({
						attempt: r.attempt,
						seq: r.seq,
						kind: r.kind,
						body: r.body,
						occurredAt: iso(r.occurred_at) as string,
					}),
				),
			};
		}).pipe(Effect.withSpan("Agents.getTask"));
	}

	listTasks(org: string, agentId?: string) {
		return Effect.tryPromise(() =>
			agentId
				? this
						.sql`SELECT * FROM agent_task WHERE org=${org} AND agent_id=${agentId} ORDER BY created_at DESC LIMIT 200`
				: this
						.sql`SELECT * FROM agent_task WHERE org=${org} ORDER BY created_at DESC LIMIT 200`,
		).pipe(
			Effect.map((rows) => rows.map(task)),
			Effect.withSpan("Agents.listTasks"),
		);
	}

	cancelTask(org: string, actor: string, id: string) {
		return txn(this.sql, "cancelTask", async (tx) => {
			const [row] =
				await tx`SELECT * FROM agent_task WHERE id=${id} AND org=${org} FOR UPDATE`;
			if (!row) throw new NotFound({ message: "Task not found" });
			if (["completed", "failed", "cancelled"].includes(row.status))
				throw new Conflict({ message: `Task already ${row.status}` });
			const [updated] =
				await tx`UPDATE agent_task SET status='cancelled', lease_until=NULL,
        stop_reason='cancelled', updated_at=now() WHERE id=${id} RETURNING *`;
			await appendEvents(tx, org, actor, [
				{ type: "task-cancelled", payload: { id, attempt: row.attempt } },
			]);
			return task(updated);
		});
	}

	// ── tasks (node side) ────────────────────────────────────────────────────
	/** Return expired leases to the queue (platform fault) or fail them out. */
	reapExpired() {
		return txn(this.sql, "reapExpired", async (tx) => {
			const expired =
				await tx`SELECT * FROM agent_task WHERE status IN ('claimed','running') AND lease_until < now() FOR UPDATE SKIP LOCKED`;
			for (const r of expired) {
				const retry = r.attempt < r.max_attempts;
				await tx`UPDATE agent_task SET status=${retry ? "queued" : "failed"}, lease_until=NULL,
          failure_code='platform.lease_expired', failure_message='Node stopped heartbeating', updated_at=now()
          WHERE id=${r.id}`;
				await appendEvents(tx, r.org, "plane", [
					{
						type: retry ? "task-requeued" : "task-finished",
						payload: retry
							? {
									id: r.id,
									attempt: r.attempt,
									failureCode: "platform.lease_expired",
								}
							: {
									id: r.id,
									attempt: r.attempt,
									outcome: "failed",
									failureCode: "platform.lease_expired",
								},
					},
				]);
			}
			return expired.length;
		});
	}

	claimOnce(n: NodeRow) {
		const leaseMs = this.leaseMs;
		return txn(this.sql, "claim", async (tx) => {
			await tx`UPDATE agent_node SET last_seen_at=now() WHERE id=${n.id}`;
			const [row] =
				await tx`SELECT t.* FROM agent_task t JOIN agent a ON a.id=t.agent_id
        WHERE t.status='queued' AND a.node_id=${n.id} AND a.archived_at IS NULL
        ORDER BY t.created_at LIMIT 1 FOR UPDATE OF t SKIP LOCKED`;
			if (!row) return null;
			const [claimed] =
				await tx`UPDATE agent_task SET status='claimed', attempt=attempt+1, node_id=${n.id},
        lease_until=now() + ${`${leaseMs} milliseconds`}::interval, failure_code=NULL, failure_message=NULL,
        updated_at=now() WHERE id=${row.id} RETURNING *`;
			const [a] = await tx`SELECT * FROM agent WHERE id=${claimed.agent_id}`;
			await appendEvents(tx, n.org, `node:${n.id}`, [
				{
					type: "task-claimed",
					payload: { id: claimed.id, attempt: claimed.attempt, nodeId: n.id },
				},
			]);
			const ag = agent(a);
			const descriptor: TaskDescriptor = {
				id: claimed.id,
				org: claimed.org,
				attempt: claimed.attempt,
				prompt: claimed.prompt,
				subjectRef: claimed.subject_ref ?? null,
				leaseMs,
				agent: {
					id: ag.id,
					name: ag.name,
					harness: ag.harness,
					model: ag.model,
					instructions: ag.instructions,
					mcpServers: ag.mcpServers,
				},
			};
			return descriptor;
		}).pipe(
			Effect.tap((d) => (d ? Metric.increment(tasksClaimed) : Effect.void)),
		);
	}

	/** Long-poll claim: wait up to waitMs for a task routed to this node. */
	claim(n: NodeRow, waitMs: number) {
		const self = this;
		return Effect.gen(function* () {
			yield* self.reapExpired();
			const deadline = Date.now() + waitMs;
			for (;;) {
				const d = yield* self.claimOnce(n);
				if (d || Date.now() >= deadline) return d;
				yield* Effect.sleep(Math.min(250, Math.max(0, deadline - Date.now())));
			}
		});
	}

	private owned(tx: TransactionSql, n: NodeRow, id: string, attempt: number) {
		return tx`SELECT * FROM agent_task WHERE id=${id} AND org=${n.org} FOR UPDATE`.then(
			([row]) => {
				if (!row) throw new NotFound({ message: "Task not found" });
				if (row.node_id !== n.id || row.attempt !== attempt)
					throw new Conflict({ message: "Attempt is not leased to this node" });
				return row;
			},
		);
	}

	start(n: NodeRow, id: string, attempt: number, nativeSessionId?: string) {
		const leaseMs = this.leaseMs;
		return txn(this.sql, "start", async (tx) => {
			const row = await this.owned(tx, n, id, attempt);
			if (row.status !== "claimed")
				throw new Conflict({ message: `Task is ${row.status}` });
			const [u] =
				await tx`UPDATE agent_task SET status='running', native_session_id=${nativeSessionId ?? null},
        lease_until=now() + ${`${leaseMs} milliseconds`}::interval, updated_at=now() WHERE id=${id} RETURNING *`;
			await appendEvents(tx, n.org, `node:${n.id}`, [
				{
					type: "task-started",
					payload: { id, attempt, nativeSessionId: nativeSessionId ?? null },
				},
			]);
			return task(u);
		});
	}

	/** Extend the lease. Returns cancelled=true when the operator cancelled. */
	heartbeat(n: NodeRow, id: string, attempt: number) {
		const leaseMs = this.leaseMs;
		return txn(this.sql, "heartbeat", async (tx) => {
			const row = await this.owned(tx, n, id, attempt);
			await tx`UPDATE agent_node SET last_seen_at=now() WHERE id=${n.id}`;
			if (row.status === "cancelled") return { cancelled: true };
			if (row.status !== "claimed" && row.status !== "running")
				throw new Conflict({ message: `Task is ${row.status}` });
			await tx`UPDATE agent_task SET lease_until=now() + ${`${leaseMs} milliseconds`}::interval,
        updated_at=now() WHERE id=${id}`;
			return { cancelled: false };
		});
	}

	appendItems(
		n: NodeRow,
		id: string,
		attempt: number,
		items: ReadonlyArray<Item>,
	) {
		return txn(this.sql, "appendItems", async (tx) => {
			const row = await this.owned(tx, n, id, attempt);
			if (row.status !== "running" && row.status !== "claimed")
				throw new Conflict({ message: `Task is ${row.status}` });
			let inserted = 0;
			for (const item of items) {
				const at = new Date(item.occurredAt);
				if (Number.isNaN(at.getTime()))
					throw new BadRequest({ message: "Invalid occurredAt" });
				const res =
					await tx`INSERT INTO agent_task_item(org,task_id,attempt,seq,kind,body,occurred_at)
          VALUES (${n.org},${id},${attempt},${item.seq},${item.kind},${tx.json((item.body ?? null) as never)},${at})
          ON CONFLICT DO NOTHING`;
				inserted += res.count;
			}
			return { inserted };
		});
	}

	finish(n: NodeRow, id: string, input: Finish) {
		return txn(this.sql, "finish", async (tx) => {
			const row = await this.owned(tx, n, id, input.attempt);
			if (row.status === "cancelled") return task(row);
			if (row.status !== "running" && row.status !== "claimed")
				throw new Conflict({ message: `Task is ${row.status}` });
			if (input.outcome === "failed" && !input.failureCode)
				throw new BadRequest({
					message: "failed outcome requires failureCode",
				});
			const retry =
				input.outcome === "failed" &&
				input.failureCode !== undefined &&
				isRetryable(input.failureCode) &&
				row.attempt < row.max_attempts;
			const status = retry ? "queued" : input.outcome;
			const [u] =
				await tx`UPDATE agent_task SET status=${status}, lease_until=NULL,
        stop_reason=${input.stopReason ?? null}, failure_code=${input.failureCode ?? null},
        failure_message=${input.failureMessage ?? null}, updated_at=now() WHERE id=${id} RETURNING *`;
			await appendEvents(tx, n.org, `node:${n.id}`, [
				{
					type: retry ? "task-requeued" : "task-finished",
					payload: {
						id,
						attempt: input.attempt,
						outcome: input.outcome,
						stopReason: input.stopReason ?? null,
						failureCode: input.failureCode ?? null,
					},
				},
			]);
			return task(u);
		}).pipe(
			Effect.tap((t) =>
				Metric.increment(tasksFinished).pipe(
					Effect.tagMetrics("status", t.status),
				),
			),
		);
	}
}
