import { Schema } from "effect";

/** Wire contract between the control plane and a runtime node (arclet).
 * The plane is inert (D4): it hands out task descriptors; the node owns the
 * harness binary, its credentials, and the raw wire journal (D14/D21). */

const Id = Schema.NonEmptyString.pipe(Schema.maxLength(128));
const Name = Schema.NonEmptyString.pipe(
	Schema.maxLength(64),
	Schema.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
);

/** Platform faults are retried on the runtime; agent faults never are. */
export const FAILURE_CODES = [
	"platform.harness_unavailable",
	"platform.harness_exited",
	"platform.protocol_error",
	"platform.lease_expired",
	"platform.node_error",
	"agent_error.refusal",
	"agent_error.max_tokens",
	"agent_error.max_turn_requests",
	"agent_error.prompt_failed",
] as const;
export const FailureCode = Schema.Literal(...FAILURE_CODES);
export type FailureCode = typeof FailureCode.Type;
export const isRetryable = (code: FailureCode) => code.startsWith("platform.");

export const ITEM_KINDS = [
	"message",
	"thinking",
	"tool_call",
	"tool_result",
	"file_change",
	"approval",
	"checkpoint",
	"config",
	"harness_meta",
] as const;
export const ItemKind = Schema.Literal(...ITEM_KINDS);
export type ItemKind = typeof ItemKind.Type;

export const McpServer = Schema.Struct({
	name: Name,
	command: Schema.NonEmptyString,
	args: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
	env: Schema.optionalWith(
		Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String })),
		{ default: () => [] },
	),
});
export type McpServer = typeof McpServer.Type;

// ── operator surface ────────────────────────────────────────────────────────
export const CreateNode = Schema.Struct({ name: Name });
export const CreateAgent = Schema.Struct({
	name: Name,
	nodeId: Id,
	harness: Name,
	model: Schema.optional(Schema.NonEmptyString.pipe(Schema.maxLength(200))),
	instructions: Schema.optionalWith(
		Schema.String.pipe(Schema.maxLength(20000)),
		{ default: () => "" },
	),
	mcpServers: Schema.optionalWith(Schema.Array(McpServer), {
		default: () => [],
	}),
});
export type CreateAgent = typeof CreateAgent.Type;
export const CreateTask = Schema.Struct({
	agentId: Id,
	prompt: Schema.NonEmptyString.pipe(Schema.maxLength(100000)),
	subjectRef: Schema.optional(
		Schema.NonEmptyString.pipe(Schema.maxLength(512)),
	),
	maxAttempts: Schema.optional(Schema.Int.pipe(Schema.between(1, 10))),
});
export type CreateTask = typeof CreateTask.Type;

// ── node surface ────────────────────────────────────────────────────────────
export const Hello = Schema.Struct({
	version: Schema.String.pipe(Schema.maxLength(64)),
	harnesses: Schema.Array(Name).pipe(Schema.maxItems(64)),
});
export const Claim = Schema.Struct({
	waitMs: Schema.optionalWith(Schema.Int.pipe(Schema.between(0, 30000)), {
		default: () => 0,
	}),
});
export const Attempt = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.positive()),
});
export const Start = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.positive()),
	nativeSessionId: Schema.optional(Schema.String.pipe(Schema.maxLength(256))),
});
export const Item = Schema.Struct({
	seq: Schema.Int.pipe(Schema.nonNegative()),
	kind: ItemKind,
	body: Schema.Unknown,
	occurredAt: Schema.String,
});
export type Item = typeof Item.Type;
export const Items = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.positive()),
	items: Schema.Array(Item).pipe(Schema.maxItems(500)),
});
export const Finish = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.positive()),
	outcome: Schema.Literal("completed", "cancelled", "failed"),
	stopReason: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),
	failureCode: Schema.optional(FailureCode),
	failureMessage: Schema.optional(Schema.String.pipe(Schema.maxLength(4000))),
});
export type Finish = typeof Finish.Type;

/** What a node receives on claim: everything needed to drive the harness. */
export interface TaskDescriptor {
	readonly id: string;
	readonly org: string;
	readonly attempt: number;
	readonly prompt: string;
	readonly subjectRef: string | null;
	readonly leaseMs: number;
	readonly agent: {
		readonly id: string;
		readonly name: string;
		readonly harness: string;
		readonly model: string | null;
		readonly instructions: string;
		readonly mcpServers: ReadonlyArray<McpServer>;
	};
}

export const TASK_STATUSES = [
	"queued",
	"claimed",
	"running",
	"completed",
	"failed",
	"cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
