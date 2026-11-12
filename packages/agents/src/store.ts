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
	type BudgetScope,
	type BudgetWindow,
	CONTEXT_RECEIPT_CONFIDENCES,
	CONTEXT_RECEIPT_DELIVERIES,
	CONTEXT_RECEIPT_KINDS,
	type ContextReceiptRow,
	type CreateAgent,
	type CreateBudget,
	type CreateTask,
	type FailureCode,
	type Finish,
	type Item,
	isRetryable,
	type McpServer,
	type PermissionDecision,
	type PermissionPark,
	type PermissionPolicy,
	type Push,
	RESUME_ITEM_RENDER_CAP,
	type ResumeItem,
	type TaskDescriptor,
	type TaskResume,
	type TaskStatus,
	type UpdateBudget,
	type Usage,
} from "./protocol";

export const PLUGIN = "agents";
export const DEFAULT_LEASE_MS = 60_000;

const tasksClaimed = Metric.counter("stellarc_agent_tasks_claimed_total");
const tasksFinished = Metric.counter("stellarc_agent_tasks_finished_total");
/** Ops signal for the collision heal (NEVR-565): nonzero means an
 * org_event_counter drifted below MAX(event.seq) and was repaired — worth an
 * alert, because the drift itself (restore, manual fix, backfill, a second
 * writer) never happens on its own. */
const eventCounterHeals = Metric.counter(
	"stellarc_agent_event_counter_heals_total",
);

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
	/** Null = legacy behaviour (every permission auto-allowed). */
	readonly permissionPolicy: PermissionPolicy | null;
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
	/** Which prior attempt this attempt resumed (NEVR-415); null = fresh. */
	readonly resumedFromAttempt: number | null;
	/** Operator verdict on a permission park: 'granted' until the heartbeat
	 * delivers it (then cleared), 'denied' terminal. Null otherwise. */
	readonly permissionDecision: "granted" | "denied" | null;
	readonly createdAt: string;
	readonly updatedAt: string;
	/** Present only while parked in budget_exhausted. */
	readonly parked?: ParkedInfo | null;
}
export interface ItemRow {
	readonly attempt: number;
	readonly seq: number;
	readonly kind: string;
	readonly body: unknown;
	readonly occurredAt: string;
}
/** Durable push attribution (NEVR-199): task → run → commit sha → ref. */
export interface PushRow {
	readonly attempt: number;
	readonly commitSha: string;
	readonly ref: string;
	readonly remote: string;
	readonly pushedAt: string;
}
/** One context-receipt row as the read path serves it (NEVR-624): the
 * projection table's fields plus the attempt/position grouping. Metadata
 * only — no content column exists anywhere in the shape. */
export interface ContextReceiptView extends ContextReceiptRow {
	readonly attempt: number;
	readonly position: number;
}
/** Harness-reported usage for one attempt, as the read path serves it
 * (NEVR-243): the COALESCE-merged finals from agent_task_usage — cumulative
 * within the attempt (last report wins, never summed), absent stays null
 * (the plane records what the harness reported, never invents). */
export interface UsageRow {
	readonly attempt: number;
	readonly tokensTotal: number | null;
	readonly tokensIn: number | null;
	readonly tokensOut: number | null;
	readonly thoughtTokens: number | null;
	readonly cachedReadTokens: number | null;
	readonly cachedWriteTokens: number | null;
	readonly contextTokens: number | null;
	readonly contextWindowSize: number | null;
	readonly costAmount: number | null;
	readonly costCurrency: string | null;
}
export interface BudgetRow {
	readonly id: string;
	readonly org: string;
	readonly scope: BudgetScope;
	readonly agentId: string | null;
	readonly nodeId: string | null;
	readonly window: BudgetWindow;
	readonly ceilingTokens: number | null;
	readonly ceilingCostAmount: number | null;
	readonly ceilingCostCurrency: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}
/** Why a task is parked and when its blocking budget resets. */
export interface ParkedInfo {
	readonly budgetId: string;
	readonly window: BudgetWindow;
	readonly resetAt: string;
	readonly consumedTokens: number;
	readonly ceilingTokens: number | null;
	readonly consumedCost: number;
	readonly ceilingCostAmount: number | null;
	readonly costCurrency: string | null;
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
	permissionPolicy:
		r.permission_policy && Array.isArray(r.permission_policy.autoAllow)
			? (r.permission_policy as PermissionPolicy)
			: null,
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
	resumedFromAttempt: r.resumed_from_attempt ?? null,
	permissionDecision: r.permission_decision ?? null,
	createdAt: iso(r.created_at) as string,
	updatedAt: iso(r.updated_at) as string,
});
const budget = (r: Row): BudgetRow => ({
	id: r.id,
	org: r.org,
	scope: r.scope,
	agentId: r.agent_id ?? null,
	nodeId: r.node_id ?? null,
	window: r.window,
	ceilingTokens: r.ceiling_tokens != null ? Number(r.ceiling_tokens) : null,
	ceilingCostAmount:
		r.ceiling_cost_amount != null ? Number(r.ceiling_cost_amount) : null,
	ceilingCostCurrency: r.ceiling_cost_currency ?? null,
	createdAt: iso(r.created_at) as string,
	updatedAt: iso(r.updated_at) as string,
});

const newId = (prefix: string) =>
	`${prefix}_${randomBytes(12).toString("hex")}`;
export const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

/** Append events to the org log inside the caller's transaction (D10). An
 * event may carry its own `actor` when the attributed principal differs from
 * the authenticated reporter (D12: the agent acts, the node reports).
 *
 * LAW (NEVR-565, precedent Multica #10117 — identical structure, production
 * outage): a counter that allocates its seqs INSIDE the insert transaction
 * must heal on collision, or one drift becomes a permanent write outage.
 * If org_event_counter ever trails MAX(event.seq) — partial restore, manual
 * data fix, backfill, a future second writer — every append collides on the
 * (org, seq) PK, the rollback un-bumps the counter, and the next append is
 * handed the same taken seqs again: the sole source of truth is frozen
 * org-wide. The heal lives in `txn` below — collision-triggered only,
 * outside the failed transaction, never eager, never on a timer.
 *
 * Second allocation site with the identical shape:
 * packages/domain/src/index.ts:128 (`runMutations`, behind
 * mutateProbes/mutateProbesEffect) — test-only today (no app imports
 * @stellarc/domain), but it commits on the SAME org_event_counter rows, so a
 * healed org is healed for every writer; it must adopt this same heal if it
 * ever goes live. packages/durable-streams-spike is a spike — deliberately
 * not healed here. */
async function appendEvents(
	tx: TransactionSql,
	org: string,
	actor: string,
	events: ReadonlyArray<{
		type: string;
		payload: Record<string, unknown>;
		actor?: string;
	}>,
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
      VALUES (${org},${seq.toString()},${`${PLUGIN}:${event.type}`},${event.actor ?? actor},${tx.json(event.payload as never)},1,${txn.txid})`;
	}
}

/** postgres.js copies the backend notice onto the error verbatim: the
 * SQLSTATE on `code`, the violated constraint on `constraint_name`. */
const isEventSeqCollision = (cause: unknown): boolean =>
	cause instanceof Error &&
	(cause as { code?: unknown }).code === "23505" &&
	(cause as { constraint_name?: unknown }).constraint_name === "event_pkey";

/** Heal drifted counters forward to MAX(event.seq) — measured per org in the
 * same committed statement that writes it, never assumed (NEVR-565). Runs as
 * its own committed transaction after the failed append has fully rolled
 * back (a bare statement autocommits). Forward-only (`c.seq < m.max`): a
 * healthy or already-healed row is a no-op, so a concurrent appender that
 * advanced the counter meanwhile cannot be dragged backwards. All drifted
 * orgs at once, not just the colliding one — one transaction can append for
 * several orgs (reapExpired), and every writer shares these rows. */
async function healEventCounters(sql: Sql) {
	return sql`
    UPDATE org_event_counter c SET seq = m.max
    FROM (SELECT org, MAX(seq) AS max FROM event GROUP BY org) m
    WHERE c.org = m.org AND c.seq < m.max
    RETURNING c.org, c.seq::text`;
}

/** One transactional attempt; on an event-seq collision, heal outside the
 * failed transaction and retry the whole body exactly once (NEVR-565). The
 * body is safe to re-run: the first transaction rolled back completely, so
 * it sees the same database (plus the heal). A second consecutive collision
 * becomes a typed Conflict — never a loop. */
async function runTxn<A>(
	sql: Sql,
	name: string,
	body: (tx: TransactionSql) => Promise<A>,
): Promise<A> {
	try {
		return await (sql.begin((tx) => body(tx)) as Promise<A>);
	} catch (first) {
		if (!isEventSeqCollision(first)) throw first;
		await healEventCounters(sql);
		Effect.runSync(Metric.update(eventCounterHeals, 1));
		try {
			return await (sql.begin((tx) => body(tx)) as Promise<A>);
		} catch (second) {
			if (isEventSeqCollision(second))
				throw new Conflict({
					message: `event seq collision persisted after an org_event_counter heal (${name}) — the counter still trails event.seq; manual investigation required`,
				});
			throw second;
		}
	}
}

/** Run a transactional body as a span; AgentsError failures pass through
 * typed. */
const txn = <A>(
	sql: Sql,
	name: string,
	body: (tx: TransactionSql) => Promise<A>,
): Effect.Effect<A, AgentsError | Error> =>
	Effect.tryPromise({
		try: () => runTxn(sql, name, body),
		catch: (cause) =>
			isAgentsError(cause)
				? cause
				: cause instanceof Error
					? cause
					: new Error(String(cause)),
	}).pipe(Effect.withSpan(`Agents.${name}`));

// ── usage capture ───────────────────────────────────────────────────────────

/** Nullable numeric fields the usage table stores; absent → null. */
interface UsageInput {
	tokensTotal: number | null;
	tokensIn: number | null;
	tokensOut: number | null;
	thoughtTokens: number | null;
	cachedReadTokens: number | null;
	cachedWriteTokens: number | null;
	contextTokens: number | null;
	contextWindowSize: number | null;
	costAmount: number | null;
	costCurrency: string | null;
}

const numOf = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const curOf = (v: unknown): string | null =>
	typeof v === "string" && /^[A-Z]{3}$/.test(v) ? v : null;

/** Lenient read of a usage item body (the node already schema-decoded `Item`;
 * the body itself is harness-reported and tolerated field by field). */
function parseUsageBody(body: unknown): UsageInput {
	const b = (body ?? {}) as Record<string, unknown>;
	return {
		tokensTotal: numOf(b.tokensTotal),
		tokensIn: numOf(b.tokensIn),
		tokensOut: numOf(b.tokensOut),
		thoughtTokens: numOf(b.thoughtTokens),
		cachedReadTokens: numOf(b.cachedReadTokens),
		cachedWriteTokens: numOf(b.cachedWriteTokens),
		contextTokens: numOf(b.contextTokens),
		contextWindowSize: numOf(b.contextWindowSize),
		costAmount: numOf(b.costAmount),
		costCurrency: curOf(b.costCurrency),
	};
}

const usageFromFinish = (u: Usage): UsageInput => ({
	tokensTotal: numOf(u.tokensTotal),
	tokensIn: numOf(u.tokensIn),
	tokensOut: numOf(u.tokensOut),
	thoughtTokens: numOf(u.thoughtTokens),
	cachedReadTokens: numOf(u.cachedReadTokens),
	cachedWriteTokens: numOf(u.cachedWriteTokens),
	contextTokens: null,
	contextWindowSize: null,
	costAmount: numOf(u.costAmount),
	costCurrency: curOf(u.costCurrency),
});

const hasAnyUsage = (u: UsageInput) => Object.values(u).some((v) => v != null);

/** Upsert one typed usage record for (task, attempt). Harness numbers are
 * cumulative for the session, so absent fields keep the stored value. Returns
 * the merged row, or null when the input carried nothing. */
async function upsertUsage(
	tx: TransactionSql,
	org: string,
	taskId: string,
	agentId: string,
	attempt: number,
	u: UsageInput,
	occurredAt: Date,
) {
	if (!hasAnyUsage(u)) return null;
	const [row] = await tx`
    INSERT INTO agent_task_usage(org,task_id,agent_id,attempt,tokens_total,tokens_in,tokens_out,
      thought_tokens,cached_read_tokens,cached_write_tokens,context_tokens,context_window_size,
      cost_amount,cost_currency,occurred_at)
    VALUES (${org},${taskId},${agentId},${attempt},${u.tokensTotal},${u.tokensIn},${u.tokensOut},
      ${u.thoughtTokens},${u.cachedReadTokens},${u.cachedWriteTokens},${u.contextTokens},${u.contextWindowSize},
      ${u.costAmount},${u.costCurrency},${occurredAt})
    ON CONFLICT (task_id, attempt) DO UPDATE SET
      tokens_total = COALESCE(EXCLUDED.tokens_total, agent_task_usage.tokens_total),
      tokens_in = COALESCE(EXCLUDED.tokens_in, agent_task_usage.tokens_in),
      tokens_out = COALESCE(EXCLUDED.tokens_out, agent_task_usage.tokens_out),
      thought_tokens = COALESCE(EXCLUDED.thought_tokens, agent_task_usage.thought_tokens),
      cached_read_tokens = COALESCE(EXCLUDED.cached_read_tokens, agent_task_usage.cached_read_tokens),
      cached_write_tokens = COALESCE(EXCLUDED.cached_write_tokens, agent_task_usage.cached_write_tokens),
      context_tokens = COALESCE(EXCLUDED.context_tokens, agent_task_usage.context_tokens),
      context_window_size = COALESCE(EXCLUDED.context_window_size, agent_task_usage.context_window_size),
      cost_amount = COALESCE(EXCLUDED.cost_amount, agent_task_usage.cost_amount),
      cost_currency = COALESCE(EXCLUDED.cost_currency, agent_task_usage.cost_currency),
      occurred_at = EXCLUDED.occurred_at,
      updated_at = now()
    RETURNING *`;
	return row;
}

const usageEvent = (taskId: string, attempt: number, r: Row | null) =>
	r
		? {
				type: "usage_recorded",
				payload: {
					taskId,
					attempt,
					tokensTotal: r.tokens_total != null ? Number(r.tokens_total) : null,
					tokensIn: r.tokens_in != null ? Number(r.tokens_in) : null,
					tokensOut: r.tokens_out != null ? Number(r.tokens_out) : null,
					costAmount: r.cost_amount != null ? Number(r.cost_amount) : null,
					costCurrency: r.cost_currency ?? null,
				},
			}
		: null;

/** Per-attempt usage rows for the operator read path (NEVR-243): one row per
 * (task, attempt) from agent_task_usage, ordered by attempt, absent fields
 * null. Unlike numOf (lenient harness-input parsing), this also coerces the
 * string form postgres.js gives bigint/numeric columns ("1500", "0.4200") —
 * null stays null, never 0. */
const num = (v: unknown): number | null => {
	if (v == null) return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) && n >= 0 ? n : null;
};

async function usageRows(sql: Sql, taskId: string): Promise<UsageRow[]> {
	const rows = await sql`
    SELECT attempt,tokens_total,tokens_in,tokens_out,thought_tokens,cached_read_tokens,cached_write_tokens,
      context_tokens,context_window_size,cost_amount,cost_currency
    FROM agent_task_usage WHERE task_id=${taskId} ORDER BY attempt`;
	return rows.map((r: Row) => ({
		attempt: r.attempt,
		tokensTotal: num(r.tokens_total),
		tokensIn: num(r.tokens_in),
		tokensOut: num(r.tokens_out),
		thoughtTokens: num(r.thought_tokens),
		cachedReadTokens: num(r.cached_read_tokens),
		cachedWriteTokens: num(r.cached_write_tokens),
		contextTokens: num(r.context_tokens),
		contextWindowSize: num(r.context_window_size),
		costAmount: num(r.cost_amount),
		costCurrency: r.cost_currency ?? null,
	}));
}

// ── context receipt (NEVR-624) ──────────────────────────────────────────────

/** Per-attempt receipt rows for the operator read path: one row per context
 * source per attempt from agent_task_context_receipt, ordered. */
async function receiptRows(
	sql: Sql,
	taskId: string,
): Promise<ContextReceiptView[]> {
	const rows = await sql`
    SELECT attempt,position,kind,name,bytes,sha256,delivery,confidence
    FROM agent_task_context_receipt WHERE task_id=${taskId} ORDER BY attempt,position`;
	return rows.map((r: Row) => ({
		attempt: Number(r.attempt),
		position: Number(r.position),
		kind: r.kind,
		name: r.name,
		bytes: Number(r.bytes),
		sha256: r.sha256,
		delivery: r.delivery,
		confidence: r.confidence,
	}));
}

const isReceiptKind = (v: unknown): v is ContextReceiptView["kind"] =>
	CONTEXT_RECEIPT_KINDS.includes(v as never);
const isReceiptDelivery = (v: unknown): v is ContextReceiptView["delivery"] =>
	CONTEXT_RECEIPT_DELIVERIES.includes(v as never);
const isReceiptConfidence = (
	v: unknown,
): v is ContextReceiptView["confidence"] =>
	CONTEXT_RECEIPT_CONFIDENCES.includes(v as never);

/** Replay projection (NEVR-624): fold org-log events back into the receipt
 * view. THE LAW the receipt lives by: the view must be renderable from the
 * event log alone — the projection table is an index, never a second source
 * of truth — so this fold is the definition of the view, and the tests pin
 * it against the table after a real run. Lenient by the usage-parser house
 * style: an event whose payload fails a field check drops out, never throws.
 * `position` is arrival order within the attempt, which is the order the
 * node posted the rows in (receipts append only at start, one batch per
 * attempt). Pure — unit-tested directly. */
export function projectContextReceipts(
	events: ReadonlyArray<{ type: string; payload: unknown }>,
): ContextReceiptView[] {
	const out: ContextReceiptView[] = [];
	const perAttempt = new Map<number, number>();
	for (const e of events) {
		if (e.type !== "context-receipt") continue;
		const p = (e.payload ?? {}) as Record<string, unknown>;
		const attempt = Number(p.attempt);
		const bytes = Number(p.bytes);
		if (
			!Number.isInteger(attempt) ||
			attempt < 1 ||
			!isReceiptKind(p.kind) ||
			typeof p.name !== "string" ||
			p.name.length === 0 ||
			p.name.length > 256 ||
			!Number.isInteger(bytes) ||
			bytes < 0 ||
			typeof p.sha256 !== "string" ||
			!/^[0-9a-f]{12}$/.test(p.sha256) ||
			!isReceiptDelivery(p.delivery) ||
			!isReceiptConfidence(p.confidence)
		)
			continue;
		const position = perAttempt.get(attempt) ?? 0;
		perAttempt.set(attempt, position + 1);
		out.push({
			attempt,
			position,
			kind: p.kind,
			name: p.name,
			bytes,
			sha256: p.sha256,
			delivery: p.delivery,
			confidence: p.confidence,
		});
	}
	return out;
}

/** Record one attempt's receipt rows: projection-table inserts plus one
 * `context-receipt` org-log event per row, appended in the SAME transaction
 * as task-started by the caller — one round trip, and the lease-ownership
 * check (`owned()`) is inherited for free. Returns the events. */
async function recordContextReceipt(
	tx: TransactionSql,
	n: NodeRow,
	id: string,
	attempt: number,
	receipt: ReadonlyArray<ContextReceiptRow>,
) {
	const events = [];
	for (let position = 0; position < receipt.length; position++) {
		const r = receipt[position];
		await tx`INSERT INTO agent_task_context_receipt(org,task_id,attempt,position,kind,name,bytes,sha256,delivery,confidence)
      VALUES (${n.org},${id},${attempt},${position},${r.kind},${r.name},${r.bytes},${r.sha256},${r.delivery},${r.confidence})`;
		// Spread of the DECODED row: exactly the six schema fields — a content
		// key that survived decode would ride this spread into the org log,
		// which is precisely what the metadata-only negative control pins
		// cannot happen (decode constructs from the declared struct).
		events.push({
			type: "context-receipt",
			payload: { id, attempt, ...r } as Record<string, unknown>,
		});
	}
	return events;
}

// ── push attribution (NEVR-199) ─────────────────────────────────────────────

/** Strip userinfo from a remote URL at the plane boundary too (defense in
 * depth — the node already strips it before reporting, D16). */
export function redactRemoteUrl(url: string): string {
	return url
		.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1")
		.replace(/^[^/@\s]+@(?=[^/]*:)/, "");
}

/** Next transcript seq for (task, attempt), continuing after any items the
 * node already streamed. */
async function maxItemSeq(
	tx: TransactionSql,
	taskId: string,
	attempt: number,
): Promise<number> {
	const [row] =
		await tx`SELECT COALESCE(MAX(seq), -1) AS max FROM agent_task_item WHERE task_id=${taskId} AND attempt=${attempt}`;
	return Number(row?.max ?? -1);
}

/** Record one attempt's pushes: typed transcript items (idempotent on seq),
 * `agent_task_push` rows (idempotent on (task, attempt, sha, ref)), and one
 * `task_pushed` event per newly inserted push. Remote URLs are re-redacted
 * here (defense in depth — the node already strips userinfo, D16). Returns
 * the events for the caller to append. */
async function recordAttemptPushes(
	tx: TransactionSql,
	n: NodeRow,
	taskId: string,
	attempt: number,
	row: Row,
	pushes: ReadonlyArray<Push>,
) {
	// Typed push items: the transcript and the org log agree, and the read
	// surface joins on commit_sha.
	const seen = new Set<string>();
	let seq = await maxItemSeq(tx, taskId, attempt);
	for (const p of pushes) {
		const dedupe = `${p.commitSha}\n${p.ref}`;
		if (seen.has(dedupe)) continue;
		seen.add(dedupe);
		seq += 1;
		await tx`INSERT INTO agent_task_item(org,task_id,attempt,seq,kind,body,occurred_at)
      VALUES (${n.org},${taskId},${attempt},${seq},'push',${tx.json({
				commitSha: p.commitSha,
				ref: p.ref,
				remote: redactRemoteUrl(p.remote),
				pushedAt: p.pushedAt,
			} as never)},${new Date(p.pushedAt)})
      ON CONFLICT DO NOTHING`;
	}
	// Rows + events.
	const events = [];
	for (const p of pushes) {
		const remote = redactRemoteUrl(p.remote);
		const res =
			await tx`INSERT INTO agent_task_push(org,task_id,attempt,commit_sha,ref,remote,pushed_at)
      VALUES (${n.org},${taskId},${attempt},${p.commitSha},${p.ref},${remote},${new Date(p.pushedAt)})
      ON CONFLICT (task_id, attempt, commit_sha, ref) DO NOTHING`;
		if (res.count === 0) continue;
		// D12 attribution chain: the agent principal acted, on behalf of the
		// task creator; the node merely reports it (D14). The future GitHub
		// linkage joins on commitSha.
		events.push({
			type: "task_pushed",
			actor: `agent:${row.agent_id}`,
			payload: {
				id: taskId,
				attempt,
				agentId: row.agent_id,
				commitSha: p.commitSha,
				ref: p.ref,
				remote,
				pushedAt: p.pushedAt,
				onBehalfOf: row.created_by,
			},
		});
	}
	return events;
}

// ── attempt continuity (NEVR-415) ────────────────────────────────────────────

/** Failure codes whose retry replays the prior attempt's transcript
 * (NEVR-415; coverage widened NEVR-462). Admission rule: a code is in when
 * its failure mechanism cannot have corrupted the RECORDED transcript.
 * Grounding is the ingest seam — every item body the node pushes is
 * Schema-decoded before the store inserts it (http.ts body() →
 * Schema.decodeUnknownEffect → INSERT) — so a platform fault can TRUNCATE
 * the persisted stream (the in-flight partial item fails decode and never
 * persists) but cannot CORRUPT what persisted.
 * - platform.lease_expired — the node went dark under a healthy run; the
 *   transcript is good work truncated mid-flight. Replay is exactly right.
 * - platform.harness_exited — process death under the agent (OOM, crash,
 *   wrapper failure). Truncation-only by the seam argument, and the
 *   runner's attribution race already reclassifies protocol_error outcomes
 *   to this code when the exit wins — most real harness deaths arrive here.
 * - platform.harness_unavailable — nothing ran on the dead attempt, but the
 *   resume CHAIN still carries earlier attempts (the chain query is
 *   attempt <= N ORDER BY attempt, seq): without admission, a platform
 *   fault consecutive to a resumed attempt drops the chain — the exact
 *   rework defect the chain exists to prevent.
 * - platform.node_error — node-side fault; every item was seam-validated
 *   before it persisted.
 * - platform.protocol_error — HELD OUT: a harness violating the protocol
 *   mid-stream deserves one real case as evidence before admission, and
 *   the attribution race already moves most exits to harness_exited.
 * - agent_error.* never replays: the transcript may be the poison.
 * Crash-loop bound: a transcript that deterministically kills the harness
 * burns attempts until the existing attempt cap stops it — bounded by
 * construction, no new mechanism needed. */
export const RESUMABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
	"platform.lease_expired",
	"platform.harness_exited",
	"platform.harness_unavailable",
	"platform.node_error",
]);

/** Kinds the resume payload can carry. usage/config are plane bookkeeping and
 * harness_meta is a raw transport dump whose signal also lands as typed
 * items — none carry context a retry needs, so they never burn budget. */
export const REPLAYABLE_KINDS: ReadonlySet<string> = new Set([
	"message",
	"thinking",
	"tool_call",
	"tool_result",
	"file_change",
	"approval",
	"checkpoint",
	"push",
	"resumed_from",
]);

/** Replay budget in ~tokens (chars/4 estimate). Each item counts at its
 * RENDERED size — the renderer clips every line's payload to
 * RESUME_ITEM_RENDER_CAP — so the budget buys prompt context, not raw-JSON
 * bytes the renderer would discard (rework defect 3). The wire still carries
 * the kept items' raw bodies; the item COUNT is what the budget bounds. */
export const RESUME_TOKEN_BUDGET = 24_000;

/** Line overhead the renderer adds around an item's clipped payload (the
 * `[kind …]` prefix plus the `…[truncated N chars]` suffix); budgeted per
 * item alongside the clip so the estimate never undershoots the digest. */
const RESUME_ITEM_LINE_OVERHEAD = 100;

/** One item's cost against the replay budget: its rendered digest line's
 * length, approximated from above by the clip plus line overhead. */
const resumeItemCost = (item: ResumeItem): number =>
	Math.min(
		JSON.stringify(item.body ?? null)?.length ?? 0,
		RESUME_ITEM_RENDER_CAP + RESUME_ITEM_LINE_OVERHEAD,
	);

/** Cap prior-attempt items to the replay budget, keeping the TAIL: the
 * freshest context is where the interrupted work stopped. The newest item is
 * always kept (the renderer truncates oversized items); `omitted` counts the
 * replayable items dropped from the head. Pure — unit-tested directly. */
export function capReplayItems(items: ReadonlyArray<ResumeItem>): {
	items: ResumeItem[];
	omitted: number;
} {
	const replayable = items.filter((i) => REPLAYABLE_KINDS.has(i.kind));
	const charBudget = RESUME_TOKEN_BUDGET * 4;
	const kept: ResumeItem[] = [];
	let used = 0;
	for (let i = replayable.length - 1; i >= 0; i--) {
		const size = resumeItemCost(replayable[i]);
		if (used + size > charBudget && kept.length > 0) break;
		kept.unshift(replayable[i]);
		used += size;
	}
	return { items: kept, omitted: replayable.length - kept.length };
}

// ── budget evaluation ───────────────────────────────────────────────────────

interface GateRow {
	id: string;
	window: BudgetWindow;
	ceiling_tokens: string | number | null;
	ceiling_cost_amount: string | null;
	ceiling_cost_currency: string | null;
	tokens_used: string;
	cost_used: string;
	reset_at: Date;
}

/** Applicable budgets for an agent (org + agent-principal + node scopes) that
 * are exhausted inside their window, most specific first. Run inside the
 * caller's transaction so enforcement is consistent with the claim write. */
async function exhaustedBudgets(
	exec: Sql,
	org: string,
	agentId: string,
): Promise<GateRow[]> {
	const rows = await exec`
    WITH target AS (
      SELECT ${agentId}::text AS agent_id,
             (SELECT node_id FROM agent WHERE id = ${agentId}) AS node_id
    )
    SELECT b.id, b."window" AS "window", b.ceiling_tokens, b.ceiling_cost_amount, b.ceiling_cost_currency,
      COALESCE(u.tokens, 0)::text AS tokens_used,
      COALESCE(u.cost, 0)::text AS cost_used,
      CASE b."window"
        WHEN 'daily' THEN date_trunc('day', now()) + interval '1 day'
        WHEN 'weekly' THEN date_trunc('week', now()) + interval '1 week'
        ELSE date_trunc('month', now()) + interval '1 month'
      END AS reset_at
    FROM agent_budget b
    CROSS JOIN target t
    LEFT JOIN LATERAL (
      SELECT SUM(u.tokens_total) AS tokens,
             SUM(u.cost_amount) FILTER (WHERE u.cost_currency = b.ceiling_cost_currency) AS cost
      FROM agent_task_usage u
      WHERE u.org = b.org
        AND u.occurred_at >= (CASE b."window"
          WHEN 'daily' THEN date_trunc('day', now())
          WHEN 'weekly' THEN date_trunc('week', now())
          ELSE date_trunc('month', now()) END)
        AND ((b.scope = 'org')
          OR (b.scope = 'agent' AND u.agent_id = b.agent_id)
          OR (b.scope = 'node' AND u.agent_id IN (SELECT id FROM agent WHERE node_id = b.node_id)))
    ) u ON true
    WHERE b.org = ${org} AND b.archived_at IS NULL
      AND ((b.scope = 'org')
        OR (b.scope = 'agent' AND b.agent_id = t.agent_id)
        OR (b.scope = 'node' AND b.node_id = t.node_id))
      AND ((b.ceiling_tokens IS NOT NULL AND COALESCE(u.tokens, 0) >= b.ceiling_tokens)
        OR (b.ceiling_cost_amount IS NOT NULL AND COALESCE(u.cost, 0) >= b.ceiling_cost_amount))
    ORDER BY CASE b.scope WHEN 'agent' THEN 1 WHEN 'node' THEN 2 ELSE 3 END, b.created_at
  `;
	return rows as unknown as GateRow[];
}

const parkedInfo = (g: GateRow): ParkedInfo => ({
	budgetId: g.id,
	window: g.window,
	resetAt: iso(g.reset_at) as string,
	consumedTokens: Number(g.tokens_used),
	ceilingTokens: g.ceiling_tokens != null ? Number(g.ceiling_tokens) : null,
	consumedCost: Number(g.cost_used),
	ceilingCostAmount:
		g.ceiling_cost_amount != null ? Number(g.ceiling_cost_amount) : null,
	costCurrency: g.ceiling_cost_currency ?? null,
});

/** Requeue parked tasks whose blocking budgets no longer exhaust (window
 * reset, admin raise, or budget removal). Returns how many resumed. */
async function unparkPassing(
	tx: TransactionSql,
	org: string,
	reason: string,
	actor: string,
) {
	const parked = await tx`SELECT id, agent_id FROM agent_task
    WHERE org = ${org} AND status = 'budget_exhausted' ORDER BY created_at`;
	let requeued = 0;
	for (const r of parked) {
		const blocked = await exhaustedBudgets(tx, org, r.agent_id);
		if (blocked.length > 0) continue;
		await tx`UPDATE agent_task SET status='queued', updated_at=now() WHERE id=${r.id}`;
		await appendEvents(tx, org, actor, [
			{ type: "task-requeued", payload: { id: r.id, reason } },
		]);
		requeued++;
	}
	return requeued;
}

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
				await tx`INSERT INTO agent(id,org,name,node_id,harness,model,instructions,mcp_servers,permission_policy,created_by)
			VALUES (${id},${org},${input.name},${input.nodeId},${input.harness},${input.model ?? null},
			${input.instructions},${tx.json(input.mcpServers as never)},${input.permissionPolicy ? tx.json(input.permissionPolicy as never) : null},${actor}) RETURNING *`;
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

	// ── budgets (operator side) ──────────────────────────────────────────────
	createBudget(org: string, actor: string, input: CreateBudget) {
		return txn(this.sql, "createBudget", async (tx) => {
			if (input.scope === "org" && (input.agentId || input.nodeId))
				throw new BadRequest({
					message: "org-scope budget takes no agentId or nodeId",
				});
			if (input.scope === "agent" && !input.agentId)
				throw new BadRequest({ message: "agent scope requires agentId" });
			if (input.scope === "node" && !input.nodeId)
				throw new BadRequest({ message: "node scope requires nodeId" });
			if (input.scope === "agent" && input.nodeId)
				throw new BadRequest({ message: "agent scope takes no nodeId" });
			if (input.scope === "node" && input.agentId)
				throw new BadRequest({ message: "node scope takes no agentId" });
			if (input.ceilingTokens == null && input.ceilingCost == null)
				throw new BadRequest({
					message: "budget needs ceilingTokens, ceilingCost, or both",
				});
			if (input.agentId) {
				const [a] =
					await tx`SELECT 1 FROM agent WHERE id=${input.agentId} AND org=${org} AND archived_at IS NULL`;
				if (!a) throw new NotFound({ message: "Agent not found" });
			}
			if (input.nodeId) {
				const [n] =
					await tx`SELECT 1 FROM agent_node WHERE id=${input.nodeId} AND org=${org} AND revoked_at IS NULL`;
				if (!n) throw new NotFound({ message: "Node not found" });
			}
			const id = newId("bud");
			const [row] =
				await tx`INSERT INTO agent_budget(id,org,scope,agent_id,node_id,"window",ceiling_tokens,ceiling_cost_amount,ceiling_cost_currency,created_by)
        VALUES (${id},${org},${input.scope},${input.agentId ?? null},${input.nodeId ?? null},${input.window},
        ${input.ceilingTokens ?? null},${input.ceilingCost?.amount ?? null},${input.ceilingCost?.currency ?? null},${actor})
        RETURNING *`;
			await appendEvents(tx, org, actor, [
				{
					type: "budget_created",
					payload: {
						id,
						scope: input.scope,
						agentId: input.agentId ?? null,
						nodeId: input.nodeId ?? null,
						window: input.window,
						ceilingTokens: input.ceilingTokens ?? null,
						ceilingCostAmount: input.ceilingCost?.amount ?? null,
						ceilingCostCurrency: input.ceilingCost?.currency ?? null,
					},
				},
			]);
			return budget(row);
		});
	}

	listBudgets(org: string) {
		return Effect.tryPromise(
			() =>
				this
					.sql`SELECT * FROM agent_budget WHERE org=${org} AND archived_at IS NULL ORDER BY created_at`,
		).pipe(
			Effect.map((rows) => rows.map(budget)),
			Effect.withSpan("Agents.listBudgets"),
		);
	}

	getBudget(org: string, id: string) {
		const sql = this.sql;
		return Effect.gen(function* () {
			const rows = yield* Effect.tryPromise(
				() =>
					sql`SELECT * FROM agent_budget WHERE id=${id} AND org=${org} AND archived_at IS NULL`,
			);
			if (rows.length === 0)
				return yield* Effect.fail(
					new NotFound({ message: "Budget not found" }),
				);
			return budget(rows[0]);
		}).pipe(Effect.withSpan("Agents.getBudget"));
	}

	updateBudget(org: string, actor: string, id: string, input: UpdateBudget) {
		return txn(this.sql, "updateBudget", async (tx) => {
			const [row] =
				await tx`SELECT * FROM agent_budget WHERE id=${id} AND org=${org} AND archived_at IS NULL FOR UPDATE`;
			if (!row) throw new NotFound({ message: "Budget not found" });
			const next = {
				window: input.window ?? (row.window as BudgetWindow),
				ceilingTokens:
					input.ceilingTokens === undefined
						? row.ceiling_tokens
						: input.ceilingTokens,
				ceilingCostAmount:
					input.ceilingCost === undefined
						? row.ceiling_cost_amount
						: (input.ceilingCost?.amount ?? null),
				ceilingCostCurrency:
					input.ceilingCost === undefined
						? row.ceiling_cost_currency
						: (input.ceilingCost?.currency ?? null),
			};
			if (next.ceilingTokens == null && next.ceilingCostAmount == null)
				throw new BadRequest({
					message: "budget needs at least one remaining ceiling",
				});
			const [updated] =
				await tx`UPDATE agent_budget SET "window"=${next.window}, ceiling_tokens=${next.ceilingTokens},
        ceiling_cost_amount=${next.ceilingCostAmount}, ceiling_cost_currency=${next.ceilingCostCurrency},
        updated_at=now() WHERE id=${id} RETURNING *`;
			const requeued = await unparkPassing(tx, org, "budget_raised", actor);
			await appendEvents(tx, org, actor, [
				{
					type: "budget_updated",
					payload: {
						id,
						window: next.window,
						ceilingTokens:
							next.ceilingTokens != null ? Number(next.ceilingTokens) : null,
						ceilingCostAmount:
							next.ceilingCostAmount != null
								? Number(next.ceilingCostAmount)
								: null,
						ceilingCostCurrency: next.ceilingCostCurrency ?? null,
						requeued,
					},
				},
			]);
			return { budget: budget(updated), requeued };
		});
	}

	deleteBudget(org: string, actor: string, id: string) {
		return txn(this.sql, "deleteBudget", async (tx) => {
			const [row] =
				await tx`SELECT * FROM agent_budget WHERE id=${id} AND org=${org} AND archived_at IS NULL FOR UPDATE`;
			if (!row) throw new NotFound({ message: "Budget not found" });
			await tx`UPDATE agent_budget SET archived_at=now(), updated_at=now() WHERE id=${id}`;
			const requeued = await unparkPassing(tx, org, "budget_removed", actor);
			await appendEvents(tx, org, actor, [
				{ type: "budget_deleted", payload: { id, requeued } },
			]);
			return { id, requeued };
		});
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
			const t = task(rows[0]);
			const items = yield* Effect.tryPromise(
				() =>
					sql`SELECT attempt,seq,kind,body,occurred_at FROM agent_task_item WHERE task_id=${id} ORDER BY attempt,seq`,
			);
			const pushes = yield* Effect.tryPromise(
				() =>
					sql`SELECT attempt,commit_sha,ref,remote,pushed_at FROM agent_task_push WHERE task_id=${id} ORDER BY attempt,pushed_at`,
			);
			const usage = yield* Effect.tryPromise(() => usageRows(sql, id));
			const receipts = yield* Effect.tryPromise(() => receiptRows(sql, id));
			const out = {
				task: t,
				items: items.map(
					(r): ItemRow => ({
						attempt: r.attempt,
						seq: r.seq,
						kind: r.kind,
						body: r.body,
						occurredAt: iso(r.occurred_at) as string,
					}),
				),
				pushes: pushes.map(
					(r): PushRow => ({
						attempt: r.attempt,
						commitSha: r.commit_sha,
						ref: r.ref,
						remote: r.remote,
						pushedAt: iso(r.pushed_at) as string,
					}),
				),
				usage,
				receipts,
			};
			if (t.status === "budget_exhausted") {
				const blocked = yield* Effect.tryPromise(() =>
					exhaustedBudgets(sql, org, t.agentId),
				);
				if (blocked.length > 0)
					out.task = { ...t, parked: parkedInfo(blocked[0]) };
			}
			return out;
		}).pipe(Effect.withSpan("Agents.getTask"));
	}

	listTasks(org: string, agentId?: string) {
		const sql = this.sql;
		return Effect.tryPromise(async () => {
			const rows = await (agentId
				? sql`SELECT * FROM agent_task WHERE org=${org} AND agent_id=${agentId} ORDER BY created_at DESC LIMIT 200`
				: sql`SELECT * FROM agent_task WHERE org=${org} ORDER BY created_at DESC LIMIT 200`);
			const out: TaskRow[] = [];
			for (const r of rows) {
				const t = task(r);
				if (t.status === "budget_exhausted") {
					const blocked = await exhaustedBudgets(sql, org, t.agentId);
					if (blocked.length > 0)
						out.push({ ...t, parked: parkedInfo(blocked[0]) });
					else out.push(t);
				} else out.push(t);
			}
			return out;
		}).pipe(Effect.withSpan("Agents.listTasks"));
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
			stop_reason='cancelled', permission_decision=NULL, updated_at=now() WHERE id=${id} RETURNING *`;
			// Settle any pending approval item in the same transaction: the node
			// cannot flush after a cancel (appendItems 409s on a terminal row),
			// so the plane records the cancellation itself — the operator sees
			// the request was cancelled, not left dangling as pending.
			await tx`UPDATE agent_task_item
				SET body = jsonb_set(body, '{status}', '"cancelled"', true)
				|| jsonb_build_object('decidedAt', to_jsonb(now()::text), 'decidedBy', ${actor}::text)
				WHERE org=${org} AND task_id=${id}
				AND kind='approval' AND body->>'status'='pending'`;
			await appendEvents(tx, org, actor, [
				{ type: "task-cancelled", payload: { id, attempt: row.attempt } },
			]);
			return task(updated);
		});
	}

	// ── tasks (node side) ────────────────────────────────────────────────────
	/** Return expired leases to the queue (platform fault) or fail them out,
	 * and resume tasks parked by an exhausted budget whose window rolled over. */
	reapExpired() {
		return txn(this.sql, "reapExpired", async (tx) => {
			// needs_permission keeps its lease only while the holding node
			// heartbeats; a node that went dark mid-park loses the held session,
			// so expiry requeues (fresh attempt) like any platform fault.
			const expired =
				await tx`SELECT * FROM agent_task WHERE status IN ('claimed','running','needs_permission') AND lease_until < now() FOR UPDATE SKIP LOCKED`;
			for (const r of expired) {
				const retry = r.attempt < r.max_attempts;
				await tx`UPDATE agent_task SET status=${retry ? "queued" : "failed"}, lease_until=NULL,
				permission_decision=NULL,
				failure_code='platform.lease_expired', failure_message='Node stopped heartbeating', updated_at=now()
				WHERE id=${r.id}`;
				// A requeue from needs_permission abandons the parked attempt:
				// settle its pending approval as cancelled so the audit trail
				// never shows a request still awaiting an answer (the new
				// attempt, if the harness re-requests, creates its own item).
				if (r.status === "needs_permission") {
					await tx`UPDATE agent_task_item
						SET body = jsonb_set(body, '{status}', '"cancelled"', true)
						|| jsonb_build_object('decidedAt', to_jsonb(now()::text), 'decidedBy', 'plane')
						WHERE org=${r.org} AND task_id=${r.id}
						AND kind='approval' AND body->>'status'='pending'`;
				}
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
			const orgs =
				await tx`SELECT DISTINCT org FROM agent_task WHERE status = 'budget_exhausted'`;
			for (const { org } of orgs)
				await unparkPassing(tx, org, "budget_window_reset", "plane");
			return expired.length;
		});
	}

	claimOnce(n: NodeRow) {
		const leaseMs = this.leaseMs;
		return txn(this.sql, "claim", async (tx) => {
			await tx`UPDATE agent_node SET last_seen_at=now() WHERE id=${n.id}`;
			// Park budget-blocked tasks (no attempt burn, no failure_code) and
			// keep scanning; bound the work per call, the claim loop retries.
			for (let scan = 0; scan < 20; scan++) {
				const [row] =
					await tx`SELECT t.* FROM agent_task t JOIN agent a ON a.id=t.agent_id
        WHERE t.status='queued' AND a.node_id=${n.id} AND a.archived_at IS NULL
        ORDER BY t.created_at LIMIT 1 FOR UPDATE OF t SKIP LOCKED`;
				if (!row) return null;
				const blocked = await exhaustedBudgets(tx, row.org, row.agent_id);
				if (blocked.length > 0) {
					const g = blocked[0];
					await tx`UPDATE agent_task SET status='budget_exhausted', updated_at=now() WHERE id=${row.id}`;
					await appendEvents(tx, n.org, `node:${n.id}`, [
						{
							type: "task_parked",
							payload: {
								id: row.id,
								attempt: row.attempt,
								budgetId: g.id,
								window: g.window,
								resetAt: iso(g.reset_at),
								consumedTokens: Number(g.tokens_used),
								ceilingTokens:
									g.ceiling_tokens != null ? Number(g.ceiling_tokens) : null,
								consumedCost: Number(g.cost_used),
								ceilingCostAmount:
									g.ceiling_cost_amount != null
										? Number(g.ceiling_cost_amount)
										: null,
							},
						},
					]);
					continue;
				}
				// Resume gate (NEVR-415): only a retry whose QUEUED row still
				// carries a resumable failure code — attempt > 1 by construction.
				const resumingFrom =
					row.attempt >= 1 &&
					row.failure_code != null &&
					RESUMABLE_FAILURE_CODES.has(row.failure_code)
						? row.attempt
						: null;
				const [claimed] =
					await tx`UPDATE agent_task SET status='claimed', attempt=attempt+1, node_id=${n.id},
					lease_until=now() + ${`${leaseMs} milliseconds`}::interval, failure_code=NULL, failure_message=NULL,
					permission_decision=NULL, resumed_from_attempt=${resumingFrom}, updated_at=now() WHERE id=${row.id} RETURNING *`;
				// Attempt continuity (NEVR-415; codes widened NEVR-462): a
				// retry whose failure code is in RESUMABLE_FAILURE_CODES
				// carries the resume CHAIN's transcript — the dead attempt
				// plus every earlier attempt its resumed_from markers link —
				// so the new session continues instead of cold-starting, and
				// a consecutive platform fault does not lose the chain's
				// first attempts (rework defect 1). The gate reads the
				// queued row's failure_code — the claim UPDATE above just
				// cleared it.
				let resume: TaskResume | undefined;
				if (resumingFrom !== null) {
					const rows =
						await tx`SELECT attempt,seq,kind,body,occurred_at FROM agent_task_item
							WHERE task_id=${row.id} AND attempt<=${row.attempt} ORDER BY attempt,seq`;
					const byAttempt = new Map<number, ResumeItem[]>();
					for (const r of rows as Row[]) {
						const list = byAttempt.get(r.attempt) ?? [];
						list.push({
							seq: r.seq,
							kind: r.kind,
							body: r.body,
							occurredAt: iso(r.occurred_at) as string,
						});
						byAttempt.set(r.attempt, list);
					}
					// Walk the chain backwards from the dead attempt through
					// each attempt's resumed_from marker, stopping at the
					// chain's fresh root — an attempt that never resumed.
					// Attempts outside the chain (an agent_error retry, a
					// fresh start after a completion) have no marker, so their
					// stale context never rides a replay.
					const chain: ResumeItem[] = [];
					const linked = new Set<number>();
					for (
						let cursor: number | undefined = row.attempt;
						cursor !== undefined && !linked.has(cursor);
					) {
						const attemptItems = byAttempt.get(cursor);
						if (!attemptItems) break;
						linked.add(cursor);
						chain.unshift(...attemptItems);
						const marker = attemptItems.find((i) => i.kind === "resumed_from");
						const prior = marker
							? Number(
									(
										(marker.body ?? {}) as {
											resumedFromAttempt?: unknown;
										}
									).resumedFromAttempt,
								)
							: Number.NaN;
						cursor =
							Number.isInteger(prior) && prior >= 1 && prior < cursor
								? prior
								: undefined;
					}
					const capped = capReplayItems(chain);
					resume = {
						fromAttempt: row.attempt,
						failureCode: row.failure_code as FailureCode,
						items: capped.items,
						omitted: capped.omitted,
					};
				}
				const [a] = await tx`SELECT * FROM agent WHERE id=${claimed.agent_id}`;
				await appendEvents(tx, n.org, `node:${n.id}`, [
					{
						type: "task-claimed",
						payload: { id: claimed.id, attempt: claimed.attempt, nodeId: n.id },
					},
					...(resume
						? [
								{
									type: "task-resumed",
									payload: {
										id: claimed.id,
										attempt: claimed.attempt,
										resumedFromAttempt: resume.fromAttempt,
										failureCode: resume.failureCode,
										items: resume.items.length,
										omitted: resume.omitted,
									},
								},
							]
						: []),
				]);
				const ag = agent(a);
				const descriptor: TaskDescriptor = {
					id: claimed.id,
					org: claimed.org,
					attempt: claimed.attempt,
					prompt: claimed.prompt,
					subjectRef: claimed.subject_ref ?? null,
					leaseMs,
					...(resume ? { resume } : {}),
					agent: {
						id: ag.id,
						name: ag.name,
						harness: ag.harness,
						model: ag.model,
						instructions: ag.instructions,
						mcpServers: ag.mcpServers,
						permissionPolicy: ag.permissionPolicy,
					},
				};
				return descriptor;
			}
			return null;
		}).pipe(
			Effect.tap((d) => (d ? Metric.update(tasksClaimed, 1) : Effect.void)),
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

	start(
		n: NodeRow,
		id: string,
		attempt: number,
		nativeSessionId?: string,
		contextReceipt?: ReadonlyArray<ContextReceiptRow>,
	) {
		const leaseMs = this.leaseMs;
		return txn(this.sql, "start", async (tx) => {
			const row = await this.owned(tx, n, id, attempt);
			if (row.status !== "claimed")
				throw new Conflict({ message: `Task is ${row.status}` });
			const [u] =
				await tx`UPDATE agent_task SET status='running', native_session_id=${nativeSessionId ?? null},
        lease_until=now() + ${`${leaseMs} milliseconds`}::interval, updated_at=now() WHERE id=${id} RETURNING *`;
			// Context receipt (NEVR-624): rows + events land in the SAME
			// transaction as task-started — no second event stream, no
			// partial receipts, and a node that predates receipts (no
			// contextReceipt in the report) simply appends none.
			const receiptEvents = contextReceipt
				? await recordContextReceipt(tx, n, id, attempt, contextReceipt)
				: [];
			await appendEvents(tx, n.org, `node:${n.id}`, [
				{
					type: "task-started",
					payload: { id, attempt, nativeSessionId: nativeSessionId ?? null },
				},
				...receiptEvents,
			]);
			return task(u);
		});
	}

	/** Extend the lease. Returns cancelled=true when the operator cancelled,
	 * and permission='granted' exactly once when an operator granted a parked
	 * permission request (the marker is consumed on delivery). */
	heartbeat(n: NodeRow, id: string, attempt: number) {
		const leaseMs = this.leaseMs;
		return txn(this.sql, "heartbeat", async (tx) => {
			const row = await this.owned(tx, n, id, attempt);
			await tx`UPDATE agent_node SET last_seen_at=now() WHERE id=${n.id}`;
			if (row.status === "cancelled") return { cancelled: true };
			// A deny already failed the row; deliver the verdict so the node
			// rejects the held request and winds the session down (its finish
			// report is then a no-op).
			if (row.status === "failed" && row.permission_decision === "denied") {
				await tx`UPDATE agent_task SET permission_decision=NULL, updated_at=now() WHERE id=${id}`;
				return { cancelled: false, permission: "denied" as const };
			}
			if (
				row.status !== "claimed" &&
				row.status !== "running" &&
				row.status !== "needs_permission"
			)
				throw new Conflict({ message: `Task is ${row.status}` });
			const permission =
				row.status === "needs_permission" &&
				row.permission_decision === "granted"
					? ("granted" as const)
					: undefined;
			await tx`UPDATE agent_task SET
          lease_until=now() + ${`${leaseMs} milliseconds`}::interval,
          permission_decision = CASE WHEN ${permission ?? null}::text IS NULL THEN permission_decision ELSE NULL END,
          status = CASE WHEN ${permission ?? null}::text IS NULL THEN status ELSE 'running' END,
          updated_at=now() WHERE id=${id}`;
			return { cancelled: false, ...(permission ? { permission } : {}) };
		});
	}

	/** Node → plane: park the task on a non-allowlisted permission request.
	 * Attempt, lease, and native session are preserved — the node holds the
	 * ACP session open and resumes it on the operator's grant. */
	permissionRequest(n: NodeRow, id: string, input: PermissionPark) {
		return txn(this.sql, "permissionRequest", async (tx) => {
			const row = await this.owned(tx, n, id, input.attempt);
			if (row.status !== "running" && row.status !== "claimed")
				throw new Conflict({ message: `Task is ${row.status}` });
			const leaseMs = this.leaseMs;
			const [u] =
				await tx`UPDATE agent_task SET status='needs_permission', permission_decision=NULL,
        lease_until=now() + ${`${leaseMs} milliseconds`}::interval, updated_at=now() WHERE id=${id} RETURNING *`;
			await appendEvents(tx, n.org, `node:${n.id}`, [
				{
					type: "task_permission_requested",
					payload: {
						id,
						attempt: input.attempt,
						request: input.request,
					},
				},
			]);
			return task(u);
		});
	}

	/** Operator → plane: resolve a parked permission request. Grant flips the
	 * task back to resumable (the node picks the verdict up on its next
	 * heartbeat and continues the held session); deny fails the task with
	 * agent_error.permission_denied — never retried, exactly like every other
	 * agent_error (retrying a human denial burns money). */
	resolvePermission(
		org: string,
		actor: string,
		id: string,
		input: PermissionDecision,
	) {
		return txn(this.sql, "resolvePermission", async (tx) => {
			const [row] =
				await tx`SELECT * FROM agent_task WHERE id=${id} AND org=${org} FOR UPDATE`;
			if (!row) throw new NotFound({ message: "Task not found" });
			if (row.status !== "needs_permission")
				throw new Conflict({ message: `Task is ${row.status}` });
			if (input.decision === "grant") {
				await tx`UPDATE agent_task SET permission_decision='granted', updated_at=now() WHERE id=${id}`;
				await appendEvents(tx, org, actor, [
					{
						type: "task_permission_granted",
						payload: { id, attempt: row.attempt },
					},
				]);
				return task(await tx`SELECT * FROM agent_task WHERE id=${id}`);
			}
			await tx`UPDATE agent_task SET status='failed', lease_until=NULL, permission_decision='denied',
			stop_reason='permission_denied', failure_code='agent_error.permission_denied',
			failure_message='Operator denied the permission request', updated_at=now() WHERE id=${id}`;
			// Settle the pending approval item in the same transaction, exactly
			// like cancelTask: the row is now terminal so the node's flush of the
			// decided item would 409 — record the denial here, with who decided.
			await tx`UPDATE agent_task_item
				SET body = jsonb_set(body, '{status}', '"denied"', true)
				|| jsonb_build_object('decidedAt', to_jsonb(now()::text), 'decidedBy', ${actor}::text)
				WHERE org=${org} AND task_id=${id}
				AND kind='approval' AND body->>'status'='pending'`;
			await appendEvents(tx, org, actor, [
				{
					type: "task_permission_denied",
					payload: { id, attempt: row.attempt },
				},
			]);
			return task(await tx`SELECT * FROM agent_task WHERE id=${id}`);
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
			if (
				row.status !== "running" &&
				row.status !== "claimed" &&
				row.status !== "needs_permission"
			)
				throw new Conflict({ message: `Task is ${row.status}` });
			let inserted = 0;
			const usageEvents = [];
			for (const item of items) {
				const at = new Date(item.occurredAt);
				if (Number.isNaN(at.getTime()))
					throw new BadRequest({ message: "Invalid occurredAt" });
				const res =
					await tx`INSERT INTO agent_task_item(org,task_id,attempt,seq,kind,body,occurred_at)
          VALUES (${n.org},${id},${attempt},${item.seq},${item.kind},${tx.json((item.body ?? null) as never)},${at})
          ON CONFLICT DO NOTHING`;
				inserted += res.count;
				if (item.kind === "usage") {
					const merged = await upsertUsage(
						tx,
						n.org,
						id,
						row.agent_id,
						attempt,
						parseUsageBody(item.body),
						at,
					);
					const event = usageEvent(id, attempt, merged);
					if (event) usageEvents.push(event);
				}
			}
			await appendEvents(tx, n.org, `node:${n.id}`, usageEvents);
			return { inserted };
		});
	}

	finish(n: NodeRow, id: string, input: Finish) {
		return txn(this.sql, "finish", async (tx) => {
			const row = await this.owned(tx, n, id, input.attempt);
			// Pushes are recorded even on a cancelled task: a push the harness
			// already made is a durable fact regardless of how the run ended
			// (NEVR-199), and the finish that reports it may be the last one
			// the plane accepts for this attempt.
			const pushEvents =
				input.pushes && input.pushes.length > 0
					? await recordAttemptPushes(
							tx,
							n,
							id,
							input.attempt,
							row,
							input.pushes,
						)
					: [];
			if (row.status === "cancelled") {
				await appendEvents(tx, n.org, `node:${n.id}`, pushEvents);
				return task(row);
			}
			// A deny already failed the task; the node's late finish report for
			// the held session is a no-op (the decision is the outcome). Narrow
			// to deny (NEVR-212 defect 2): any OTHER failed row — e.g. an
			// attempt-exhausted platform.lease_expired — keeps its legacy 409.
			// Match on failure_code, not permission_decision: the heartbeat that
			// DELIVERED the deny already cleared permission_decision.
			if (
				row.status === "failed" &&
				row.failure_code === "agent_error.permission_denied"
			)
				return task(row);
			if (
				row.status !== "running" &&
				row.status !== "claimed" &&
				row.status !== "needs_permission"
			)
				throw new Conflict({ message: `Task is ${row.status}` });
			if (input.outcome === "failed" && !input.failureCode)
				throw new BadRequest({
					message: "failed outcome requires failureCode",
				});
			const events: Array<{
				type: string;
				payload: Record<string, unknown>;
				actor?: string;
			}> = [...pushEvents];
			if (input.usage) {
				const merged = await upsertUsage(
					tx,
					n.org,
					id,
					row.agent_id,
					input.attempt,
					usageFromFinish(input.usage),
					new Date(),
				);
				const event = usageEvent(id, input.attempt, merged);
				if (event) events.push(event);
			}
			const retry =
				input.outcome === "failed" &&
				input.failureCode !== undefined &&
				isRetryable(input.failureCode) &&
				row.attempt < row.max_attempts;
			const status = retry ? "queued" : input.outcome;
			const [u] =
				await tx`UPDATE agent_task SET status=${status}, lease_until=NULL,
        stop_reason=${input.stopReason ?? null}, failure_code=${input.failureCode ?? null},
        failure_message=${input.failureMessage ?? null}, permission_decision=NULL, updated_at=now() WHERE id=${id} RETURNING *`;
			events.push({
				type: retry ? "task-requeued" : "task-finished",
				payload: {
					id,
					attempt: input.attempt,
					outcome: input.outcome,
					stopReason: input.stopReason ?? null,
					failureCode: input.failureCode ?? null,
				},
			});
			await appendEvents(tx, n.org, `node:${n.id}`, events);
			return task(u);
		}).pipe(
			Effect.tap((t) =>
				Metric.update(
					Metric.withAttributes(tasksFinished, { status: t.status }),
					1,
				),
			),
		);
	}
}
