import { Effect, Schema } from "effect";

/** Wire contract between the control plane and a runtime node (arclet).
 * The plane is inert (D4): it hands out task descriptors; the node owns the
 * harness binary, its credentials, and the raw wire journal (D14/D21). */

const Id = Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(128)));
const Name = Schema.NonEmptyString.pipe(
	Schema.check(
		Schema.isMaxLength(64),
		Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
	),
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
export const FailureCode = Schema.Literals([...FAILURE_CODES]);
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
export const ItemKind = Schema.Literals([...ITEM_KINDS]);
export type ItemKind = typeof ItemKind.Type;

export const McpServer = Schema.Struct({
	name: Name,
	command: Schema.NonEmptyString,
	args: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultType(Effect.sync(() => [] as Array<string>)),
	),
	env: Schema.Array(
		Schema.Struct({ name: Schema.String, value: Schema.String }),
	).pipe(
		Schema.withDecodingDefaultType(
			Effect.sync(() => [] as Array<{ name: string; value: string }>),
		),
	),
});
export type McpServer = typeof McpServer.Type;

// ── operator surface ────────────────────────────────────────────────────────
export const CreateNode = Schema.Struct({ name: Name });
export const CreateAgent = Schema.Struct({
	name: Name,
	nodeId: Id,
	harness: Name,
	model: Schema.optional(
		Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(200))),
	),
	instructions: Schema.String.pipe(
		Schema.check(Schema.isMaxLength(20000)),
		Schema.withDecodingDefaultType(Effect.sync(() => "")),
	),
	mcpServers: Schema.Array(McpServer).pipe(
		Schema.withDecodingDefaultType(Effect.sync(() => [] as Array<McpServer>)),
	),
});
export type CreateAgent = typeof CreateAgent.Type;
export const CreateTask = Schema.Struct({
	agentId: Id,
	prompt: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(100000))),
	subjectRef: Schema.optional(
		Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(512))),
	),
	maxAttempts: Schema.optional(
		Schema.Int.pipe(
			Schema.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
		),
	),
});
export type CreateTask = typeof CreateTask.Type;

// ── node surface ────────────────────────────────────────────────────────────
export const Hello = Schema.Struct({
	version: Schema.String.pipe(Schema.check(Schema.isMaxLength(64))),
	harnesses: Schema.Array(Name).pipe(Schema.check(Schema.isMaxLength(64))),
});
export const Claim = Schema.Struct({
	waitMs: Schema.Int.pipe(
		Schema.check(Schema.isBetween({ minimum: 0, maximum: 30000 })),
		Schema.withDecodingDefaultType(Effect.sync(() => 0)),
	),
});
export const Attempt = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
});
export const Start = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
	nativeSessionId: Schema.optional(
		Schema.String.pipe(Schema.check(Schema.isMaxLength(256))),
	),
});
export const Item = Schema.Struct({
	seq: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
	kind: ItemKind,
	body: Schema.Unknown,
	occurredAt: Schema.String,
});
export type Item = typeof Item.Type;
export const Items = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
	items: Schema.Array(Item).pipe(Schema.check(Schema.isMaxLength(500))),
});
export const Finish = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
	outcome: Schema.Literals(["completed", "cancelled", "failed"]),
	stopReason: Schema.optional(
		Schema.String.pipe(Schema.check(Schema.isMaxLength(64))),
	),
	failureCode: Schema.optional(FailureCode),
	failureMessage: Schema.optional(
		Schema.String.pipe(Schema.check(Schema.isMaxLength(4000))),
	),
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
