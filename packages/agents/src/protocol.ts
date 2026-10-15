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
	"agent_error.permission_denied",
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
	"usage",
	"push",
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

/** Agent-level permission policy (NEVR-198). `autoAllow` holds glob-style
 * tool patterns (`read`, `grep`, `mcp:github.list_*`) that the node may
 * auto-approve without a human. A null policy preserves the legacy behaviour
 * exactly: every `session/request_permission` answered allow_once. */
export const PermissionPolicy = Schema.Struct({
	autoAllow: Schema.Array(
		Schema.NonEmptyString.pipe(Schema.maxLength(256)),
	).pipe(Schema.maxItems(256)),
});
export type PermissionPolicy = typeof PermissionPolicy.Type;

/** One permission request as the node reports it to the plane: the options the
 * harness offered plus the RESOLVED argument values (not the template), so the
 * deciding human sees what would actually run (D12; Factory v0.237 lesson). */
export const PermissionRequestReport = Schema.Struct({
	sessionId: Schema.String.pipe(Schema.maxLength(256)),
	toolCallId: Schema.String.pipe(Schema.maxLength(256)),
	/** Programmatic tool name when the harness reports one (e.g. `bash`,
	 * `mcp:github.create_issue`); null when only a human title is known. */
	toolName: Schema.NullOr(Schema.String.pipe(Schema.maxLength(256))),
	title: Schema.NullOr(Schema.String.pipe(Schema.maxLength(512))),
	options: Schema.Array(
		Schema.Struct({
			optionId: Schema.String.pipe(Schema.maxLength(256)),
			name: Schema.String.pipe(Schema.maxLength(256)),
			kind: Schema.String.pipe(Schema.maxLength(64)),
		}),
	).pipe(Schema.maxItems(32)),
});
export type PermissionRequestReport = typeof PermissionRequestReport.Type;

// ── operator surface ────────────────────────────────────────────────────────
export const BUDGET_WINDOWS = ["daily", "weekly", "monthly"] as const;
export type BudgetWindow = (typeof BUDGET_WINDOWS)[number];
export const BUDGET_SCOPES = ["org", "agent", "node"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

/** Money ceiling on a budget: amount + ISO-4217 currency. */
export const BudgetCost = Schema.Struct({
	amount: Schema.Number.pipe(Schema.positive(), Schema.finite()),
	currency: Schema.String.pipe(
		Schema.pattern(/^[A-Z]{3}$/),
		Schema.maxLength(3),
	),
});
export type BudgetCost = typeof BudgetCost.Type;

export const CreateBudget = Schema.Struct({
	scope: Schema.Literal(...BUDGET_SCOPES),
	agentId: Schema.optional(Id),
	nodeId: Schema.optional(Id),
	window: Schema.Literal(...BUDGET_WINDOWS),
	/** Token ceiling for the window; at least one ceiling must be set. */
	ceilingTokens: Schema.optional(
		Schema.Number.pipe(Schema.positive(), Schema.finite()),
	),
	ceilingCost: Schema.optional(BudgetCost),
});
export type CreateBudget = typeof CreateBudget.Type;

export const UpdateBudget = Schema.Struct({
	window: Schema.optional(Schema.Literal(...BUDGET_WINDOWS)),
	ceilingTokens: Schema.optional(
		Schema.NullOr(Schema.Number.pipe(Schema.positive(), Schema.finite())),
	),
	ceilingCost: Schema.optional(Schema.NullOr(BudgetCost)),
});
export type UpdateBudget = typeof UpdateBudget.Type;

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
	permissionPolicy: Schema.optional(PermissionPolicy),
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
/** Harness-reported usage for one run attempt (ACP `usage` is cumulative for
 * the session; the plane records numbers, never invents them — where the
 * harness reports only tokens, cost stays absent). */
export const Usage = Schema.Struct({
	tokensTotal: Schema.optional(
		Schema.Number.pipe(Schema.nonNegative(), Schema.finite()),
	),
	tokensIn: Schema.optional(
		Schema.Number.pipe(Schema.nonNegative(), Schema.finite()),
	),
	tokensOut: Schema.optional(
		Schema.Number.pipe(Schema.nonNegative(), Schema.finite()),
	),
	thoughtTokens: Schema.optional(
		Schema.NullOr(Schema.Number.pipe(Schema.nonNegative(), Schema.finite())),
	),
	cachedReadTokens: Schema.optional(
		Schema.NullOr(Schema.Number.pipe(Schema.nonNegative(), Schema.finite())),
	),
	cachedWriteTokens: Schema.optional(
		Schema.NullOr(Schema.Number.pipe(Schema.nonNegative(), Schema.finite())),
	),
	/** Cumulative session cost when the harness reports one. */
	costAmount: Schema.optional(
		Schema.Number.pipe(Schema.nonNegative(), Schema.finite()),
	),
	costCurrency: Schema.optional(
		Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/), Schema.maxLength(3)),
	),
});
export type Usage = typeof Usage.Type;

/** One durable push fact observed in the run's workdir (NEVR-199): commit
 * authorship is spoofable free text; the push event is the attribution the
 * plane keeps. Populated by stellarc-node from the harness workdir's git
 * remote-tracking reflogs at finish — no GitHub API at this stage. */
export const Push = Schema.Struct({
	commitSha: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{40}$/)),
	ref: Schema.NonEmptyString.pipe(Schema.maxLength(256)),
	remote: Schema.NonEmptyString.pipe(Schema.maxLength(512)),
	pushedAt: Schema.String,
});
export type Push = typeof Push.Type;

export const Finish = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.positive()),
	outcome: Schema.Literal("completed", "cancelled", "failed"),
	stopReason: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),
	failureCode: Schema.optional(FailureCode),
	failureMessage: Schema.optional(Schema.String.pipe(Schema.maxLength(4000))),
	/** Harness-reported token/cost totals for this attempt (ACP
	 * `PromptResponse.usage`, UNSTABLE but SDK-typed). */
	usage: Schema.optional(Usage),
	/** Commits the run's workdir pushed to git remotes during this attempt.
	 * Absent or empty when nothing was pushed (NEVR-199). */
	pushes: Schema.optional(Schema.Array(Push).pipe(Schema.maxItems(200))),
});
export type Finish = typeof Finish.Type;

/** Node → plane: a non-allowlisted permission request parked the task. The
 * plane flips the task to needs_permission (no attempt burn, no failure_code,
 * lease and native session preserved) and waits for an operator verdict. */
export const PermissionPark = Schema.Struct({
	attempt: Schema.Int.pipe(Schema.positive()),
	request: PermissionRequestReport,
});
export type PermissionPark = typeof PermissionPark.Type;

/** Operator → plane: the human verdict on a parked permission request. Grant
 * resumes the held session on the same attempt; deny fails the task with
 * agent_error.permission_denied and is never retried. */
export const PermissionDecision = Schema.Struct({
	decision: Schema.Literal("grant", "deny"),
});
export type PermissionDecision = typeof PermissionDecision.Type;

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
		/** Null preserves the legacy allow-once behaviour. */
		readonly permissionPolicy: PermissionPolicy | null;
	};
}

export const TASK_STATUSES = [
	"queued",
	"claimed",
	"running",
	"completed",
	"failed",
	"cancelled",
	/** Parked by an exhausted budget: excluded from claims, no attempt burn, no
	 * failure_code; resumable on window reset (claim loop retries) or an admin
	 * raise. A platform-shaped condition, never agent_error.*. */
	"budget_exhausted",
	/** Parked by a non-allowlisted permission request (NEVR-198): excluded
	 * from claims, no attempt burn, no failure_code. The node keeps the lease
	 * and holds the native session open; an operator grant resumes the same
	 * attempt in place, a deny fails with agent_error.permission_denied. */
	"needs_permission",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
