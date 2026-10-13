import { createHash, randomBytes } from "node:crypto";
import { Effect, Metric } from "effect";
import type { Sql, TransactionSql } from "postgres";
import { BadRequest, Conflict, NotFound, Unauthenticated } from "./errors";
import { appendEvents, txn } from "./events";
import { appendMemoryEvents, hashContent } from "./memory";
import {
	type CreateAgent,
	type CreateTask,
	type FailureCode,
	type Finish,
	type Item,
	isRetryable,
	type McpServer,
	MEMORY_KINDS,
	type MemoryKind as ProtocolMemoryKind,
	type TaskDescriptor,
	type TaskStatus,
	type TaskType,
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
	readonly taskType: TaskType;
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
	taskType: r.task_type ?? "run",
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

	/** Distill trigger (NEVR-179): enqueue a memory.distill task whose prompt
	 * embeds the agent's recent transcript excerpts. Budget parking: there is
	 * no budget infra yet (companion issue); the seam is this method — when a
	 * budget gate lands, it parks here before enqueueing. */
	createDistillTask(
		org: string,
		actor: string,
		agentId: string,
		lookbackTasks = 10,
	) {
		return txn(this.sql, "createDistillTask", async (tx) => {
			const [a] =
				await tx`SELECT * FROM agent WHERE id=${agentId} AND org=${org} AND archived_at IS NULL`;
			if (!a) throw new NotFound({ message: "Agent not found" });
			const [policy] =
				await tx`SELECT memory_enabled FROM org_policy WHERE org=${org}`;
			if (policy && !policy.memory_enabled)
				throw new Conflict({
					message: "Memory is disabled for this workspace",
				});
			// Recent completed run transcripts for this agent principal.
			const tasks = await tx`SELECT id, prompt FROM agent_task
        WHERE org=${org} AND agent_id=${agentId} AND task_type='run' AND status='completed'
        ORDER BY created_at DESC LIMIT ${lookbackTasks}`;
			const ids = tasks.map((r) => r.id);
			const excerpts: string[] = [];
			if (ids.length > 0) {
				const rows = await tx`SELECT task_id, kind, body FROM agent_task_item
          WHERE org=${org} AND task_id IN ${tx(ids)} AND kind IN ('message','thinking')
          ORDER BY task_id, attempt, seq`;
				let current = "";
				let currentTask = "";
				for (const r of rows) {
					if (r.task_id !== currentTask) {
						if (current) excerpts.push(current);
						currentTask = r.task_id;
						current = `# Task ${r.task_id}\n`;
					}
					const body = r.body as {
						role?: string;
						content?: Array<{ type: string; text?: string }>;
						text?: string;
					} | null;
					let text = "";
					if (Array.isArray(body?.content))
						text = (body?.content ?? [])
							.map((c) => (c.type === "text" ? (c.text ?? "") : ""))
							.join("");
					else if (typeof body?.text === "string") text = body.text;
					current += `- ${r.kind}: ${text.slice(0, 400)}\n`;
				}
				if (current) excerpts.push(current);
			}
			const corpus = excerpts
				.slice(0, lookbackTasks)
				.map((e) => e.slice(0, 4000))
				.join("\n")
				.slice(0, 40000);
			const id = newId("task");
			const prompt = [
				"You are distilling long-term memory for an agent.",
				"Read the recent task transcripts below and emit durable facts, preferences, skills, summaries, and corrections.",
				"Emit each artifact as a line in one of these forms (no other output):",
				"WRITE <kind> <content>   where <kind> is one of fact|preference|skill|summary|correction",
				"DELETE <memory-id>",
				"",
				"Transcripts:",
				corpus || "(no recent transcripts)",
			].join("\n");
			const [row] =
				await tx`INSERT INTO agent_task(id,org,agent_id,subject_ref,prompt,task_type,max_attempts,created_by)
        VALUES (${id},${org},${agentId},NULL,${prompt},'memory.distill',1,${actor})
        RETURNING *`;
			await appendEvents(tx, org, actor, [
				{
					type: "task-created",
					payload: { id, agentId, taskType: "memory.distill" },
				},
			]);
			await tx`SELECT pg_notify('stellarc_agent_task', ${agentId})`;
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
			// Memory resolution at claim time: only when the workspace switch is on
			// (NEVR-179 scope+governance). Distill tasks carry no memory forward.
			const live: Array<{ id: string; kind: string; content: string }> = [];
			if (claimed.task_type === "run") {
				const [policy] =
					await tx`SELECT memory_enabled FROM org_policy WHERE org=${n.org}`;
				if (!policy || policy.memory_enabled) {
					const rows =
						await tx`SELECT id, kind, content FROM agent_memory WHERE org=${n.org} AND agent_id=${ag.id}
			AND deleted_at IS NULL ORDER BY created_seq DESC LIMIT 500`;
					const newestFirst = rows.map((r) => ({
						id: r.id as string,
						kind: r.kind as string,
						content: r.content as string,
					}));
					let used = 0;
					for (const entry of newestFirst.reverse()) {
						if (live.length > 0 && used + entry.content.length > 24000) break;
						live.push(entry);
						used += entry.content.length;
					}
				}
			}
			const descriptor: TaskDescriptor = {
				id: claimed.id,
				org: claimed.org,
				attempt: claimed.attempt,
				prompt: claimed.prompt,
				subjectRef: claimed.subject_ref ?? null,
				leaseMs,
				taskType:
					claimed.task_type === "memory.distill" ? "memory.distill" : "run",
				agent: {
					id: ag.id,
					name: ag.name,
					harness: ag.harness,
					model: ag.model,
					instructions: ag.instructions,
					mcpServers: ag.mcpServers,
				},
				memory: live,
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
			// Memory capture (NEVR-179): a memory.distill task's memory_write items
			// fold into agents:memory_* events + projection while the items land.
			// Honors the workspace switch: policy off → no memory events at all.
			if (row.task_type === "memory.distill") {
				const [policy] =
					await tx`SELECT memory_enabled FROM org_policy WHERE org=${n.org}`;
				if (!policy || policy.memory_enabled) {
					const fold: Array<{
						type: "memory_written" | "memory_deleted";
						payload: Record<string, unknown>;
					}> = [];
					for (const i of items) {
						if (i.kind !== "memory_write") continue;
						const b = i.body as {
							kind?: string;
							content?: string;
							id?: string;
							deleted?: boolean;
						};
						if (b?.deleted === true && typeof b.id === "string") {
							fold.push({
								type: "memory_deleted",
								payload: { id: b.id, agentId: row.agent_id },
							});
							continue;
						}
						const kind = b?.kind ?? "";
						const content = (b?.content ?? "").trim();
						if (
							!kind ||
							!content ||
							!MEMORY_KINDS.includes(kind as ProtocolMemoryKind) ||
							content.length > 2000
						)
							continue;
						fold.push({
							type: "memory_written",
							payload: {
								id:
									typeof b.id === "string" && b.id
										? b.id
										: `mem_${randomBytes(12).toString("hex")}`,
								agentId: row.agent_id,
								kind,
								content,
								contentHash: hashContent(kind as ProtocolMemoryKind, content),
								source: "distill",
								sourceTaskId: id,
								actor: `node:${n.id}`,
							},
						});
					}
					if (fold.length > 0)
						await appendMemoryEvents(tx, n.org, `node:${n.id}`, fold);
				}
			}
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
			// Distill completion marker (NEVR-179): one event summarizing the run's
			// refined artifacts. Counted from the projection, after the fold.
			if (
				row.task_type === "memory.distill" &&
				!retry &&
				input.outcome === "completed"
			) {
				const [live] = await tx`SELECT count(*)::int AS n FROM agent_memory
			WHERE org=${n.org} AND agent_id=${row.agent_id} AND deleted_at IS NULL`;
				await appendEvents(tx, n.org, `node:${n.id}`, [
					{
						type: "memory_distilled",
						payload: {
							taskId: id,
							agentId: row.agent_id,
							liveEntries: live?.n ?? 0,
						},
					},
				]);
			}
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
