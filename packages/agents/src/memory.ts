import { createHash, randomBytes } from "node:crypto";
import { Effect } from "effect";
import type { Sql, TransactionSql } from "postgres";
import { type AgentsError, NotFound } from "./errors";
import { appendEvents, txn } from "./events";
import {
	MEMORY_KINDS as PROTOCOL_KINDS,
	type MemoryKind as ProtocolKind,
} from "./protocol";

/** Agent memory (NEVR-179). The org event log is the source of truth —
 * `agents:memory_written`, `agents:memory_deleted`, `agents:memory_distilled` —
 * and the `agent_memory` table is a projection written only by
 * `applyMemoryEvent` (called while appending the event that produced it, or
 * when replaying the log). Memory belongs to the agent principal: org-scoped,
 * never shared across agents. */

export const MEMORY_KINDS = PROTOCOL_KINDS;
export type MemoryKind = ProtocolKind;

/** Injection budget: at most this many live entries / characters per agent. */
export const MEMORY_MAX_ENTRIES = 500;
export const MEMORY_MAX_CHARS = 24_000;

export interface MemoryEntry {
	readonly id: string;
	readonly org: string;
	readonly agentId: string;
	readonly kind: MemoryKind;
	readonly content: string;
	readonly source: string;
	readonly sourceTaskId: string | null;
	readonly createdAt: string;
	readonly createdSeq: string;
}

export const hashContent = (kind: MemoryKind, content: string) =>
	createHash("sha256").update(`${kind}\u0000${content.trim()}`).digest("hex");

const newMemoryId = () => `mem_${randomBytes(12).toString("hex")}`;

/** A memory event as it appears in the log, with its seq resolved. */
export interface MemoryEvent {
	readonly seq: bigint;
	readonly type: "memory_written" | "memory_deleted" | "memory_distilled";
	readonly payload: Record<string, unknown>;
}

/** The single writer of the agent_memory projection. Idempotent: a write that
 * loses the dedupe race (same agent + content hash among live rows) is
 * skipped, and deleting an already-deleted id is a no-op. The log leads; the
 * view follows. */
export async function applyMemoryEvent(
	tx: TransactionSql,
	org: string,
	event: MemoryEvent,
): Promise<number> {
	if (event.type === "memory_written") {
		const p = event.payload as {
			id: string;
			agentId: string;
			kind: string;
			content: string;
			contentHash: string;
			source?: string;
			sourceTaskId?: string | null;
			actor?: string;
		};
		const res =
			await tx`INSERT INTO agent_memory(id,org,agent_id,kind,content,content_hash,source,source_task_id,created_seq,created_by)
      VALUES (${p.id},${org},${p.agentId},${p.kind},${p.content},${p.contentHash},${p.source ?? "distill"},${p.sourceTaskId ?? null},${event.seq.toString()},${p.actor ?? "plane"})
      ON CONFLICT DO NOTHING`;
		return res.count;
	}
	if (event.type === "memory_deleted") {
		const p = event.payload as { id: string };
		const res =
			await tx`UPDATE agent_memory SET deleted_at=now(), deleted_seq=${event.seq.toString()}
      WHERE id=${p.id} AND org=${org} AND deleted_at IS NULL`;
		return res.count;
	}
	return 0;
}

/** Append a batch of memory events and fold each into the projection at its
 * own seq, in one transaction. Returns the ids the projection actually
 * inserted (dedupe losers are skipped) and the seq range. */
export async function appendMemoryEvents(
	tx: TransactionSql,
	org: string,
	actor: string,
	events: ReadonlyArray<{
		readonly type: MemoryEvent["type"];
		readonly payload: Record<string, unknown>;
	}>,
): Promise<{ first: bigint; last: bigint; inserted: number }> {
	const range = await appendEvents(tx, org, actor, events);
	let seq = range.first;
	let inserted = 0;
	for (const event of events) {
		if (event.type !== "memory_distilled")
			inserted += await applyMemoryEvent(tx, org, {
				seq,
				type: event.type,
				payload: event.payload,
			});
		seq += 1n;
	}
	return { ...range, inserted };
}

/** Replay the org's whole memory event history into a fresh projection.
 * Deletes are keyed by id (and only ever delete live rows), so replay order is
 * log order and the result converges to the same live set. */
export const rebuildMemoryProjection = (sql: Sql, org: string) =>
	txn(sql, "rebuildMemoryProjection", async (tx) => {
		await tx`DELETE FROM agent_memory WHERE org=${org}`;
		const rows = await tx`SELECT seq, plugin_type, payload FROM event
      WHERE org=${org} AND plugin_type IN ('agents:memory_written','agents:memory_deleted','agents:memory_distilled')
      ORDER BY seq`;
		let inserted = 0;
		for (const r of rows) {
			inserted += await applyMemoryEvent(tx, org, {
				seq: BigInt(r.seq),
				type: r.plugin_type.replace("agents:", "") as MemoryEvent["type"],
				payload: r.payload as Record<string, unknown>,
			});
		}
		return { replayed: rows.length, inserted };
	});

/** Fold a single task's transcript items into memory-write events. Shared by
 * the distill run (node side reports distilled entries as items; the plane
 * turns them into events) and by nothing else — run-completion capture is
 * deliberately NOT done here; memory arrives via distill or operator writes. */
export function memoryEventsFromItems(
	_org: string,
	agentId: string,
	actor: string,
	taskId: string,
	items: ReadonlyArray<{ kind: string; body: unknown }>,
): Array<{ type: MemoryEvent["type"]; payload: Record<string, unknown> }> {
	const events: Array<{
		type: MemoryEvent["type"];
		payload: Record<string, unknown>;
	}> = [];
	for (const item of items) {
		if (item.kind !== "memory_write") continue;
		const body = item.body as {
			kind?: string;
			content?: string;
			id?: string;
			deleted?: boolean;
		};
		if (body?.deleted === true && typeof body.id === "string") {
			events.push({
				type: "memory_deleted",
				payload: { id: body.id, agentId, taskId },
			});
			continue;
		}
		const kind = body?.kind;
		const content = body?.content?.trim();
		if (
			!kind ||
			!MEMORY_KINDS.includes(kind as MemoryKind) ||
			!content ||
			content.length > 2000
		)
			continue;
		const id = typeof body.id === "string" && body.id ? body.id : newMemoryId();
		events.push({
			type: "memory_written",
			payload: {
				id,
				agentId,
				kind,
				content,
				contentHash: hashContent(kind as MemoryKind, content),
				source: "distill",
				sourceTaskId: taskId,
				actor,
			},
		});
	}
	return events;
}

export class MemoryStore {
	constructor(private readonly sql: Sql) {}

	/** Workspace policy: default enabled for orgs with no row yet. */
	policy(org: string) {
		return Effect.tryPromise(
			() => this.sql`SELECT memory_enabled FROM org_policy WHERE org=${org}`,
		).pipe(
			// biome-ignore lint/suspicious/noExplicitAny: postgres.js row shape
			Effect.map((rows: any[]) =>
				rows.length === 0 || Boolean(rows[0].memory_enabled)
					? { memoryEnabled: true }
					: { memoryEnabled: false },
			),
			Effect.withSpan("Agents.memoryPolicy"),
		);
	}

	setPolicy(org: string, actor: string, memoryEnabled: boolean) {
		return Effect.tryPromise(
			() =>
				this.sql`INSERT INTO org_policy(org,memory_enabled,updated_by)
        VALUES (${org},${memoryEnabled},${actor})
        ON CONFLICT (org) DO UPDATE SET memory_enabled=${memoryEnabled}, updated_by=${actor}, updated_at=now()`,
		).pipe(Effect.withSpan("Agents.setMemoryPolicy"));
	}

	list(org: string, agentId: string) {
		return Effect.tryPromise(
			() =>
				this
					.sql`SELECT * FROM agent_memory WHERE org=${org} AND agent_id=${agentId} AND deleted_at IS NULL ORDER BY created_seq DESC`,
		).pipe(
			// biome-ignore lint/suspicious/noExplicitAny: projection row
			Effect.map((rows: any[]) => rows.map(memoryRow)),
			Effect.withSpan("Agents.listMemory"),
		);
	}

	/** Live entries for injection, oldest-first, within entry/char budgets. */
	liveForAgent(org: string, agentId: string) {
		return Effect.tryPromise(
			() =>
				this
					.sql`SELECT * FROM agent_memory WHERE org=${org} AND agent_id=${agentId} AND deleted_at IS NULL ORDER BY created_seq DESC LIMIT ${MEMORY_MAX_ENTRIES}`,
		).pipe(
			// biome-ignore lint/suspicious/noExplicitAny: projection row
			Effect.map((rows: any[]) => {
				const newestFirst = rows.map(memoryRow);
				let used = 0;
				const out: MemoryEntry[] = [];
				for (const entry of newestFirst.reverse()) {
					if (out.length > 0 && used + entry.content.length > MEMORY_MAX_CHARS)
						break;
					out.push(entry);
					used += entry.content.length;
				}
				return out;
			}),
			Effect.withSpan("Agents.liveMemoryForAgent"),
		);
	}

	/** Operator write of one entry: event + projection fold, atomically. */
	write(
		org: string,
		actor: string,
		input: {
			agentId: string;
			kind: MemoryKind;
			content: string;
			source?: string;
		},
	): Effect.Effect<{ id: string; inserted: number }, AgentsError | Error> {
		return txn(this.sql, "writeMemory", async (tx) => {
			await assertLiveAgent(tx, org, input.agentId);
			const id = newMemoryId();
			const payload = {
				id,
				agentId: input.agentId,
				kind: input.kind,
				content: input.content,
				contentHash: hashContent(input.kind, input.content),
				source: input.source ?? "operator",
				sourceTaskId: null,
				actor,
			};
			const { first, inserted } = await appendMemoryEvents(tx, org, actor, [
				{ type: "memory_written", payload },
			]);
			void first;
			return { id, inserted };
		});
	}

	/** Operator delete (soft): event first, projection follows. */
	delete(org: string, actor: string, agentId: string, id: string) {
		return txn(this.sql, "deleteMemory", async (tx) => {
			const [row] =
				await tx`SELECT 1 FROM agent_memory WHERE id=${id} AND org=${org} AND agent_id=${agentId} AND deleted_at IS NULL`;
			if (!row) throw new NotFound({ message: "Memory entry not found" });
			await appendMemoryEvents(tx, org, actor, [
				{ type: "memory_deleted", payload: { id, agentId } },
			]);
			return { id };
		});
	}
}

// biome-ignore lint/suspicious/noExplicitAny: postgres.js row shape
const memoryRow = (r: any): MemoryEntry => ({
	id: r.id,
	org: r.org,
	agentId: r.agent_id,
	kind: r.kind,
	content: r.content,
	source: r.source,
	sourceTaskId: r.source_task_id ?? null,
	createdAt:
		r.created_at instanceof Date
			? r.created_at.toISOString()
			: String(r.created_at),
	createdSeq: String(r.created_seq),
});

async function assertLiveAgent(
	tx: TransactionSql,
	org: string,
	agentId: string,
) {
	const [row] =
		await tx`SELECT id FROM agent WHERE id=${agentId} AND org=${org} AND archived_at IS NULL`;
	if (!row) throw new NotFound({ message: "Agent not found" });
}
