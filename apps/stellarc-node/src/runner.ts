import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type {
	FailureCode,
	Item,
	ItemKind,
	PermissionPolicy,
	PermissionRequestReport,
	ResumeItem,
	TaskDescriptor,
	TaskResume,
	Usage,
} from "../../../packages/agents/src/protocol";

/** A locally installed harness the node is willing to launch. Credentials and
 * binaries stay on the node (D14/D16); the plane only learns the name. */
export interface HarnessSpec {
	readonly command: string;
	readonly args: ReadonlyArray<string>;
	readonly env?: Readonly<Record<string, string>>;
}

export interface RunHooks {
	readonly onStart: (nativeSessionId: string) => Promise<void>;
	readonly onItems: (items: ReadonlyArray<Item>) => Promise<void>;
	/** Latest plane state: cancelled flag plus, exactly once, the operator
	 * verdict on a parked permission request. */
	readonly heartbeat: () => Promise<{
		cancelled: boolean;
		permission?: "granted" | "denied";
	}>;
	readonly heartbeatMs: number;
	readonly workdir: string;
	readonly log?: (msg: string) => void;
	/** The node parked on a permission request: report it to the plane so a
	 * human can decide (called with the approval transcript item flushed). */
	readonly onPermissionRequest: (
		request: PermissionRequestReport,
	) => Promise<void>;
}

export interface RunOutcome {
	readonly outcome: "completed" | "cancelled" | "failed";
	readonly stopReason?: string;
	readonly failureCode?: FailureCode;
	readonly failureMessage?: string;
	/** Harness-reported token/cost totals for this run (ACP
	 * `PromptResponse.usage`, UNSTABLE); the plane records, never invents. */
	readonly usage?: Usage;
}

const STOP: Record<string, RunOutcome> = {
	end_turn: { outcome: "completed", stopReason: "end_turn" },
	cancelled: { outcome: "cancelled", stopReason: "cancelled" },
	refusal: {
		outcome: "failed",
		stopReason: "refusal",
		failureCode: "agent_error.refusal",
	},
	max_tokens: {
		outcome: "failed",
		stopReason: "max_tokens",
		failureCode: "agent_error.max_tokens",
	},
	max_turn_requests: {
		outcome: "failed",
		stopReason: "max_turn_requests",
		failureCode: "agent_error.max_turn_requests",
	},
};

/** Folds ACP session/update notifications into transcript items (D22): parts
 * are transport-only, so consecutive message/thought chunks coalesce into one
 * item and flush when the stream changes kind. */
export class TranscriptFolder {
	private seq = 0;
	private open: {
		kind: "message" | "thinking";
		text: string;
		at: string;
	} | null = null;
	private ready: Item[] = [];
	private cost: { amount: number; currency: string } | null = null;

	private push(kind: ItemKind, body: unknown, at = new Date().toISOString()) {
		this.ready.push({ seq: this.seq++, kind, body, occurredAt: at });
	}
	private close() {
		if (!this.open) return;
		const { kind, text, at } = this.open;
		this.open = null;
		this.push(
			kind,
			kind === "message"
				? { role: "assistant", content: [{ type: "text", text }] }
				: { text, redacted: false, provider_opaque: false },
			at,
		);
	}
	private chunk(kind: "message" | "thinking", block: acp.ContentBlock) {
		const text = block.type === "text" ? block.text : `[${block.type}]`;
		if (this.open?.kind !== kind) {
			this.close();
			this.open = { kind, text: "", at: new Date().toISOString() };
		}
		this.open.text += text;
	}

	userPrompt(text: string) {
		this.push("message", { role: "user", content: [{ type: "text", text }] });
	}

	/** Attempt-continuity seam (NEVR-415): this run resumed a prior
	 * attempt's transcript — the first item of the new attempt, so operators
	 * see where the cold start ended and the replay began. */
	resumedFrom(body: Record<string, unknown>) {
		this.close();
		this.push("resumed_from", body);
	}

	/** A permission decision artifact (NEVR-198): the request with resolved
	 * arguments plus its status, written outside the ACP update stream. */
	approval(body: Record<string, unknown>) {
		this.close();
		this.push("approval", body);
	}

	update(u: acp.SessionUpdate) {
		switch (u.sessionUpdate) {
			case "agent_message_chunk":
				return this.chunk("message", u.content);
			case "agent_thought_chunk":
				return this.chunk("thinking", u.content);
			case "user_message_chunk":
				return;
			case "usage_update": {
				// UNSTABLE ACP extension: context + cumulative session cost. Typed
				// capture at the seam (NEVR-178); absent harness fields stay absent.
				this.close();
				if (u.cost)
					this.cost = { amount: u.cost.amount, currency: u.cost.currency };
				return this.push("usage", {
					contextTokens: u.used,
					contextWindowSize: u.size,
					costAmount: u.cost?.amount,
					costCurrency: u.cost?.currency,
				});
			}
			case "tool_call":
				this.close();
				return this.push("tool_call", {
					call_id: u.toolCallId,
					title: u.title,
					kind: u.kind ?? "other",
					status: u.status ?? "pending",
					input: u.rawInput ?? null,
					locations: u.locations ?? [],
				});
			case "tool_call_update":
				if (u.status !== "completed" && u.status !== "failed") return;
				this.close();
				return this.push("tool_result", {
					call_id: u.toolCallId,
					status: u.status,
					is_error: u.status === "failed",
					title: u.title ?? null,
					content: u.content ?? [],
					output: u.rawOutput ?? null,
				});
			default:
				this.close();
				return this.push("harness_meta", { subtype: u.sessionUpdate, data: u });
		}
	}

	config(body: Record<string, unknown>) {
		this.close();
		this.push("config", body);
	}

	/** Drain completed items; `final` also closes the open chunk run. */
	take(final = false): Item[] {
		if (final) this.close();
		const out = this.ready;
		this.ready = [];
		return out;
	}

	/** Latest cumulative session cost reported via usage_update, if any. */
	sessionCost() {
		return this.cost;
	}
}

/** Glob-style tool-pattern match for permission policies. `*` spans within a
 * dot-separated segment (`mcp:github.list_*`), `?` one char; no cross-segment
 * wildcard — an allowlist entry names the tool it allows, not a prefix. */
function toolMatches(pattern: string, tool: string): boolean {
	const re = new RegExp(
		`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? "[^.]*" : c === "?" ? "[^.]" : `\\${c}`))}$`,
	);
	return re.test(tool);
}

/** Does the agent's policy auto-approve this permission request? A null
 * policy preserves the legacy behaviour exactly: everything auto-allowed. */
export function policyAllows(
	policy: PermissionPolicy | null | undefined,
	toolName: string | null,
): boolean {
	if (!policy) return true;
	if (!toolName) return false;
	return policy.autoAllow.some((p) => toolMatches(p, toolName));
}

/** Legacy answer for policy-less agents (and allowlisted requests): prefer
 * allow_once, then allow_always; otherwise cancel the tool call. */
function pickPermission(
	options: ReadonlyArray<acp.PermissionOption>,
): acp.RequestPermissionResponse {
	const allow =
		options.find((o) => o.kind === "allow_once") ??
		options.find((o) => o.kind === "allow_always");
	return allow
		? { outcome: { outcome: "selected", optionId: allow.optionId } }
		: { outcome: { outcome: "cancelled" } };
}

function denyPermission(
	options: ReadonlyArray<acp.PermissionOption>,
): acp.RequestPermissionResponse {
	const reject =
		options.find((o) => o.kind === "reject_once") ??
		options.find((o) => o.kind === "reject_always");
	return reject
		? { outcome: { outcome: "selected", optionId: reject.optionId } }
		: { outcome: { outcome: "cancelled" } };
}

// ── attempt continuity (NEVR-415) ───────────────────────────────────────────

/** Per-item rendering cap for the resume digest: enough for a real tool
 * result, small enough that a pathological dump cannot eat the prompt. */
export const RESUME_ITEM_RENDER_CAP = 1500;

const clip = (text: string) =>
	text.length > RESUME_ITEM_RENDER_CAP
		? `${text.slice(0, RESUME_ITEM_RENDER_CAP)}…[truncated ${text.length - RESUME_ITEM_RENDER_CAP} chars]`
		: text;

const compactJson = (body: unknown) => clip(JSON.stringify(body ?? null));

/** One prior-attempt transcript item as one digest line. Targets the body
 * shapes TranscriptFolder writes (the plane stores them verbatim); tolerates
 * anything else via compact JSON. Null = nothing to show (bookkeeping kinds
 * never reach the renderer, but be lenient anyway). */
function renderResumeItem(item: ResumeItem): string | null {
	const b = (item.body ?? {}) as Record<string, unknown>;
	const id = typeof b.call_id === "string" ? ` (${b.call_id})` : "";
	switch (item.kind) {
		case "message": {
			const role = typeof b.role === "string" ? b.role : "unknown";
			const text = Array.isArray(b.content)
				? b.content
						.map((c) =>
							c && typeof c === "object" && "text" in c
								? String((c as { text: unknown }).text ?? "")
								: "",
						)
						.join("")
				: String(b.content ?? "");
			return `[${role}] ${clip(text)}`;
		}
		case "thinking":
			return `[thought] ${clip(String(b.text ?? ""))}`;
		case "tool_call": {
			const title = typeof b.title === "string" ? b.title : "tool";
			return `[tool_call ${title}${id}] ${compactJson(b.input)}`;
		}
		case "tool_result": {
			const status = typeof b.status === "string" ? b.status : "?";
			return `[tool_result ${status}${id}] ${compactJson(b.output ?? b.content)}`;
		}
		case "approval": {
			const req = (b.request ?? {}) as Record<string, unknown>;
			const tool = typeof req.toolName === "string" ? req.toolName : "?";
			return `[permission ${String(b.status ?? "?")} ${tool}] ${compactJson(req.arguments)}`;
		}
		case "push": {
			const sha =
				typeof b.commitSha === "string" ? b.commitSha.slice(0, 10) : "?";
			return `[pushed ${sha} → ${String(b.ref ?? "?")}]`;
		}
		case "resumed_from":
			return `[resumed from attempt ${String(b.resumedFromAttempt ?? "?")}]`;
		case "file_change":
		case "checkpoint":
			return `[${item.kind}] ${compactJson(b)}`;
		default:
			return null;
	}
}

/** Render the resume payload as the prompt block that seeds the new session
 * (NEVR-415). Composed BEFORE the original prompt — the imperative lands
 * last, and the model reads the digest as context, not instruction. Pure —
 * unit-tested directly. */
export function renderResumeDigest(resume: TaskResume): string {
	const header = `## Prior attempt context (attempt ${resume.fromAttempt})

Your previous attempt (attempt ${resume.fromAttempt}) was interrupted by a platform fault (${resume.failureCode}) — the runtime died under you; nothing you did failed. Its transcript follows, oldest first${resume.omitted > 0 ? ` (${resume.omitted} older item(s) omitted for length)` : ""}. Continue the task from where the transcript ends; work that already succeeded (including pushes) does not need to be redone.`;
	const lines = resume.items
		.map(renderResumeItem)
		.filter((line): line is string => line !== null);
	return `${header}\n${lines.join("\n")}`;
}

/** Environment a harness child is born with: an explicit allowlist, never the
 * node's own `process.env` — STELLARC_NODE_TOKEN and every other STELLARC_*
 * var must be unreachable from the harness and its MCP descendants
 * (NEVR-198: a prompt-injected harness could otherwise exfiltrate the node's
 * own credential). */
export function harnessEnv(
	spec: Pick<HarnessSpec, "env">,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of ["PATH", "HOME", "TMPDIR", "LANG"]) {
		const v = process.env[key];
		if (v !== undefined) env[key] = v;
	}
	return { ...env, ...spec.env };
}

export async function runTask(
	task: TaskDescriptor,
	harness: HarnessSpec,
	hooks: RunHooks,
): Promise<RunOutcome> {
	await mkdir(hooks.workdir, { recursive: true });
	const folder = new TranscriptFolder();
	let child: ReturnType<typeof spawn>;
	try {
		child = spawn(harness.command, [...harness.args], {
			cwd: hooks.workdir,
			env: harnessEnv(harness),
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (error) {
		return {
			outcome: "failed",
			failureCode: "platform.harness_unavailable",
			failureMessage: String(error),
		};
	}
	let stderrTail = "";
	child.stderr?.on("data", (d: Buffer) => {
		stderrTail = (stderrTail + d.toString()).slice(-2000);
	});
	const exited = new Promise<RunOutcome>((resolve) => {
		child.on("error", (error) =>
			resolve({
				outcome: "failed",
				failureCode: "platform.harness_unavailable",
				failureMessage: String(error),
			}),
		);
		child.on("exit", (code, signal) =>
			resolve({
				outcome: "failed",
				failureCode: "platform.harness_exited",
				failureMessage:
					`harness exited (code=${code}, signal=${signal}) ${stderrTail.slice(-500)}`.trim(),
			}),
		);
	});

	const stream = acp.ndJsonStream(
		Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>,
		Readable.toWeb(
			child.stdout as Readable,
		) as unknown as ReadableStream<Uint8Array>,
	);
	const conn = new acp.ClientSideConnection(
		() => ({
			sessionUpdate: async (n) => folder.update(n.update),
			requestPermission: async (p) => {
				folder.update({
					sessionUpdate: "tool_call_update",
					toolCallId: p.toolCall.toolCallId,
				} as acp.SessionUpdate);
				const toolName = p.toolCall.name ?? null;
				if (policyAllows(task.agent.permissionPolicy, toolName))
					return pickPermission(p.options);
				// Not allowlisted: park. Write the approval transcript item
				// (options + RESOLVED argument values — Factory v0.237 lesson),
				// tell the plane, and hold the session open until a verdict
				// arrives on the heartbeat.
				const report: PermissionRequestReport = {
					sessionId: p.sessionId,
					toolCallId: p.toolCall.toolCallId,
					toolName,
					title: p.toolCall.title ?? null,
					options: p.options.map((o) => ({
						optionId: o.optionId,
						name: o.name,
						kind: o.kind,
					})),
				};
				// Concurrent permission requests serialize on parkGate
				// (NEVR-212 defect 1): ACP harnesses may issue parallel tool
				// calls, and two parks in flight would race the plane's
				// one-verdict mailbox — the second overwriting the first's
				// waiter and its POST hitting a row still in
				// needs_permission (409 → requeue). Close the gate
				// SYNCHRONOUSLY at entry (before any await) and queue on the
				// PREVIOUS holder: a concurrent callback can never slip past
				// an already-resolved gate. The queued request parks only
				// after the previous verdict was DELIVERED — the same
				// heartbeat transaction that flips the plane row back to
				// running — so it parks against a resumable row, and each
				// request consumes exactly one verdict.
				const previousGate = parkGate;
				let openGate!: () => void;
				parkGate = new Promise<void>((o) => {
					openGate = o;
				});
				try {
					await previousGate;
					// The run is terminal (operator cancel or deny already
					// delivered): answer reject locally instead of parking
					// against a dead row (which would 409).
					if (cancelled || deniedRun) return denyPermission(p.options);
					const verdict = new Promise<"granted" | "denied" | "cancelled">(
						(resolve) => {
							parkedWaiter = resolve;
						},
					);
					folder.approval({
						request: {
							...report,
							arguments: p.toolCall.rawInput ?? null,
						},
						status: "pending",
					});
					await flush(true).catch((e) =>
						hooks.log?.(`approval flush failed: ${e}`),
					);
					await hooks.onPermissionRequest(report);
					const v = await verdict;
					folder.approval({
						request: {
							...report,
							arguments: p.toolCall.rawInput ?? null,
						},
						status: v,
						decidedAt: new Date().toISOString(),
					});
					await flush(true).catch((e) =>
						hooks.log?.(`approval flush failed: ${e}`),
					);
					// A cancelled run answers reject too: the harness gets a
					// settled response and can wind down instead of blocking
					// on a permission answer that will never come.
					return v === "granted"
						? pickPermission(p.options)
						: denyPermission(p.options);
				} finally {
					openGate();
				}
			},
		}),
		stream,
	);

	let flushing = Promise.resolve();
	const flush = (final = false) => {
		const items = folder.take(final);
		if (items.length) flushing = flushing.then(() => hooks.onItems(items));
		return flushing;
	};
	let sessionId: string | undefined;
	let cancelled = false;
	// Set when a deny verdict was delivered: the task is terminal, so any
	// request still queued on parkGuard answers reject locally instead of
	// parking against a failed row (which would 409).
	let deniedRun = false;
	/** The pending parked permission request's settle function, if any. The
	 * verdict mailbox is one-slot: a verdict delivered while no request is
	 * parked is dropped (it answers nothing), and each parked request consumes
	 * at most one verdict — a grant never sticks to approve later requests. */
	let parkedWaiter: ((v: "granted" | "denied" | "cancelled") => void) | null =
		null;
	/** Serializes parking (NEVR-212 defect 1): while a request is parked, a
	 * concurrent one awaits this gate. The gate opens only when the parked
	 * request fully settled (verdict delivered, items flushed, response sent) —
	 * by then the delivering heartbeat already moved the plane row out of
	 * needs_permission, so the queued request parks against a resumable row
	 * instead of wedging or requeueing. */
	let parkGate: Promise<void> = Promise.resolve();
	const settleParked = (v: "granted" | "denied" | "cancelled") => {
		const w = parkedWaiter;
		parkedWaiter = null;
		if (v === "denied") deniedRun = true;
		w?.(v);
	};
	const flushTimer = setInterval(() => void flush().catch(() => {}), 500);
	const beat = setInterval(async () => {
		try {
			const state = await hooks.heartbeat();
			if (state.permission) settleParked(state.permission);
			if (state.cancelled && !cancelled) {
				cancelled = true;
				settleParked("cancelled");
				if (sessionId) await conn.cancel({ sessionId });
			}
		} catch (error) {
			hooks.log?.(`heartbeat failed: ${error}`);
		}
	}, hooks.heartbeatMs);

	const drive = (async (): Promise<RunOutcome> => {
		try {
			await conn.initialize({
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {
					fs: { readTextFile: false, writeTextFile: false },
				},
			});
			const session = await conn.newSession({
				cwd: hooks.workdir,
				mcpServers: task.agent.mcpServers.map((s) => ({
					name: s.name,
					command: s.command,
					args: [...s.args],
					env: [...s.env],
				})),
			});
			sessionId = session.sessionId;
			await hooks.onStart(session.sessionId);
			if (task.agent.model) {
				// BYO agents choose their own model; we only *request* one when the
				// harness advertises a model selector (ACP config options).
				const opt = session.configOptions?.find((o) => o.category === "model");
				let applied = false;
				if (opt && opt.type === "select") {
					try {
						await conn.setSessionConfigOption({
							sessionId: session.sessionId,
							configId: opt.id,
							value: task.agent.model,
						} as acp.SetSessionConfigOptionRequest);
						applied = true;
					} catch (error) {
						hooks.log?.(`model selection rejected: ${error}`);
					}
				}
				folder.config({ model: task.agent.model, applied });
			}
			// Attempt continuity (NEVR-415): a resumed attempt seeds the new
			// session with the prior attempt's transcript — digest BEFORE the
			// original prompt (the imperative lands last), and a resumed_from
			// marker as the attempt's first transcript item so operators see
			// the seam.
			if (task.resume) {
				folder.resumedFrom({
					resumedFromAttempt: task.resume.fromAttempt,
					failureCode: task.resume.failureCode,
					items: task.resume.items.length,
					omitted: task.resume.omitted,
				});
			}
			const parts: string[] = [];
			if (task.agent.instructions) parts.push(task.agent.instructions);
			if (task.resume) parts.push(renderResumeDigest(task.resume));
			parts.push(task.prompt);
			const text = parts.join("\n\n---\n\n");
			folder.userPrompt(text);
			if (cancelled) await conn.cancel({ sessionId: session.sessionId });
			const res = await conn.prompt({
				sessionId: session.sessionId,
				prompt: [{ type: "text", text }],
			});
			if (cancelled) return { outcome: "cancelled", stopReason: "cancelled" };
			const uc = folder.sessionCost();
			const usage: Usage | undefined = res.usage
				? {
						tokensTotal: res.usage.totalTokens,
						tokensIn: res.usage.inputTokens,
						tokensOut: res.usage.outputTokens,
						thoughtTokens: res.usage.thoughtTokens ?? null,
						cachedReadTokens: res.usage.cachedReadTokens ?? null,
						cachedWriteTokens: res.usage.cachedWriteTokens ?? null,
						costAmount: uc?.amount,
						costCurrency: uc?.currency,
					}
				: undefined;
			const base = STOP[res.stopReason] ?? {
				outcome: "failed" as const,
				stopReason: res.stopReason,
				failureCode: "agent_error.prompt_failed" as FailureCode,
			};
			return usage ? { ...base, usage } : base;
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: typeof error === "object"
						? JSON.stringify(error)
						: String(error);
			return {
				outcome: "failed",
				failureCode: "platform.protocol_error",
				failureMessage: `${message} ${stderrTail.slice(-500)}`
					.trim()
					.slice(0, 4000),
			};
		}
	})();

	let outcome = await Promise.race([drive, exited]);
	// A crashing harness closes stdout before 'exit' fires, so the ACP call
	// rejects first: give the exit a moment to win the attribution.
	if (outcome.failureCode === "platform.protocol_error") {
		const exit = await Promise.race([
			exited,
			new Promise<null>((r) => setTimeout(() => r(null), 500)),
		]);
		if (exit) outcome = exit;
	}
	clearInterval(flushTimer);
	clearInterval(beat);
	await flush(true).catch((error) =>
		hooks.log?.(`final flush failed: ${error}`),
	);
	child.kill("SIGTERM");
	const killer = setTimeout(() => child.kill("SIGKILL"), 3000);
	await Promise.race([exited, new Promise((r) => setTimeout(r, 3500))]);
	clearTimeout(killer);
	return cancelled && outcome.outcome !== "completed"
		? { outcome: "cancelled", stopReason: "cancelled" }
		: outcome;
}
