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
	TaskDescriptor,
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
	/** Transcript tail the plane could not accept mid-run (NEVR-229): after an
	 * operator cancel or a lost lease the row is terminal, so appendItems
	 * would 409 — the items travel with the finish report instead, which the
	 * plane records on a cancelled row exactly like pushes (NEVR-199). */
	readonly finalItems?: ReadonlyArray<Item>;
}

/** Why a run ended mid-stream (NEVR-229): the partial assistant item stays
 * in the transcript, marked with one of these in its body. */
export type InterruptReason = "operator_cancel" | "lease_lost" | "harness_exit";

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
		/** Set when the run ends before the stream closes (NEVR-229): the
		 * partial item is still recorded, marked with why it stopped. */
		interrupted?: InterruptReason;
	} | null = null;
	private ready: Item[] = [];
	private cost: { amount: number; currency: string } | null = null;

	private push(kind: ItemKind, body: unknown, at = new Date().toISOString()) {
		this.ready.push({ seq: this.seq++, kind, body, occurredAt: at });
	}
	private close() {
		if (!this.open) return;
		const { kind, text, at, interrupted } = this.open;
		this.open = null;
		const marker =
			kind === "message"
				? { role: "assistant", content: [{ type: "text", text }] }
				: { text, redacted: false, provider_opaque: false };
		this.push(
			kind,
			interrupted === undefined
				? marker
				: { ...marker, interrupted: true, interruptReason: interrupted },
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

	/** The run ended with the stream still open (NEVR-229): the partial
	 * item keeps its accumulated text and is closed with the marker the
	 * next time the folder drains — Devin's keep-the-partial-reply lesson. */
	markInterrupted(reason: InterruptReason) {
		if (this.open) this.open.interrupted = reason;
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

	/** Is a chunk stream still open? (NEVR-229 teardown check — an open
	 * stream when the run ends means it was interrupted mid-stream.) */
	hasOpen(): boolean {
		return this.open !== null;
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

/** The processes a harness tool call must never be allowed to signal
 * (NEVR-229, Factory v0.242's refuse-self-kill translated to Stellarc's
 * shape: the exec surface is the harness itself, so the guard lives at the
 * node's permission seam). `harnessCommand` is the spawned spec's command
 * word (e.g. `bun`, `npx`, `hermes`) — the harness child's cmdline identity. */
export interface SelfKillContext {
	readonly nodePid: number;
	readonly harnessPid: number | null;
	readonly harnessCommand: string | null;
}

/** Extract every string value from a raw tool input, plus the tool name —
 * the guard never assumes a shape: ACP rawInput is harness-defined JSON.
 * Finite numbers are stringified too: pids ride as numbers (`{pid: 4242}`). */
function commandStrings(toolName: string | null, rawInput: unknown): string[] {
	const out: string[] = [];
	if (toolName) out.push(toolName);
	const walk = (v: unknown) => {
		if (typeof v === "string") out.push(v);
		else if (typeof v === "number" && Number.isFinite(v)) out.push(String(v));
		else if (Array.isArray(v)) for (const e of v) walk(e);
		else if (v != null && typeof v === "object")
			for (const e of Object.values(v)) walk(e);
	};
	walk(rawInput);
	return out;
}

/** Split a command string into shell-ish words: whitespace-separated, with
 * surrounding quotes dropped and `\<space>` unescaped — a guard must
 * over-match, never under-match. */
function words(command: string): string[] {
	const tokens: string[] = [];
	for (const raw of command.replace(/\\ /g, " ").split(/\s+/)) {
		const t = raw.replace(/^['"]+|['"]+$/g, "");
		if (t) tokens.push(t);
	}
	return tokens;
}

const isPid = (s: string) => /^\d+$/.test(s);

/** The harness command's cmdline identities: the full spec word and its
 * basename (`/usr/bin/bun` → `bun`) — pkill/killall may target either. */
function harnessNames(ctx: SelfKillContext): string[] {
	if (!ctx.harnessCommand) return [];
	const full = ctx.harnessCommand.toLowerCase();
	const base = full.split("/").pop() ?? full;
	return base && base !== full ? [full, base] : [full];
}

/** Does a process-NAME target (`killall node`, `pkill bun`, `taskkill /IM`)
 * name the node or its harness? Only unambiguous identities match: anything
 * containing `stellarc`, or the harness's own command word. `killall node`
 * alone is deliberately NOT matched on a shared host (other node processes
 * exist; the node's runtime identity is `stellarc-node`, not `node`) — the
 * pid-literal and `-f` pattern forms cover the actual self-targets. */
function isSelfProcessName(name: string, ctx: SelfKillContext): boolean {
	const n = name.toLowerCase().replace(/\.exe$/, "");
	if (n.includes("stellarc")) return true;
	return harnessNames(ctx).some((h) => n === h);
}

/** Does a `pkill -f` (full command-line) pattern match the node or harness
 * command line? Over-match by design: the node's cmdline always contains
 * `stellarc`; the harness matches on word boundaries (`bun` must not match
 * inside `bundle`). */
function patternTargetsSelf(pattern: string, ctx: SelfKillContext): boolean {
	const p = pattern.toLowerCase();
	if (p.includes("stellarc")) return true;
	return harnessNames(ctx).some((h) =>
		new RegExp(`\\b${h.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`).test(
			p,
		),
	);
}

/** Machine/supervisor-class commands: signalling the machine or init kills
 * the node's whole world regardless of pid targeting. */
const SUPERVISOR_COMMANDS = new Set([
	"shutdown",
	"reboot",
	"halt",
	"poweroff",
	"init",
	"telinit",
]);

/** Pure self/supervisor-kill guard (NEVR-229): does this tool call name a
 * command that would signal the stellarc-node process itself, its current
 * harness child, or the node's supervisor relationship? Covers `kill <pid>`,
 * `kill -9 <pid>`, `pkill -f stellarc`, `pkill -f <harness command>`,
 * `killall stellarc-node`, `taskkill /PID <pid>` / `/IM stellarc-node`, and
 * bare supervisor commands. Deliberately over-matches — a false positive
 * costs one refused tool call the operator can see; a false negative kills
 * the runtime holding the session. */
export function isSelfKillCommand(
	toolName: string | null,
	rawInput: unknown,
	ctx: SelfKillContext,
): boolean {
	const pids = new Set(
		[ctx.nodePid, ctx.harnessPid].filter(
			(p): p is number => p != null && p > 0,
		),
	);
	// Corpus analysis: rawInput often splits the invocation across sibling
	// strings (`{argv: ["kill", "4242"]}`) or numbers; the joined text still
	// names the command, so every string is analyzed alone AND the whole
	// corpus joined is analyzed as one command line.
	const corpus = commandStrings(toolName, rawInput);
	const inputs = [...corpus, corpus.join(" ")];
	for (const s of inputs) {
		const tokens = words(s);
		if (tokens.length === 0) continue;
		const lower = tokens.map((w) => w.toLowerCase());
		// Kill verbs may appear anywhere in the line, not just position 0:
		// `sudo kill 4242`, `bash kill 4242` (joined corpus), `kill; pkill`
		// compound lines. Scan every occurrence; flags/args between verb and
		// target are consumed by the per-verb loops below.
		for (let at = 0; at < lower.length; at++) {
			// Supervisor-class: any invocation as the command word, bare or
			// under sudo/doas — a prefixed supervisor command is still supervisor.
			const effective =
				lower[at] === "sudo" || lower[at] === "doas"
					? lower[at + 1]
					: lower[at];
			if (SUPERVISOR_COMMANDS.has(effective)) return true;
			// taskkill /PID <n> | /IM <image>
			if (effective === "taskkill") {
				for (let i = at + 1; i < tokens.length; i++) {
					if (
						lower[i] === "/pid" &&
						tokens[i + 1] &&
						pids.has(Number(tokens[i + 1]))
					)
						return true;
					if (
						lower[i] === "/im" &&
						tokens[i + 1] &&
						isSelfProcessName(tokens[i + 1], ctx)
					)
						return true;
				}
				continue;
			}
			// kill <pid> [-<sig>] <pid>: any pid literal anywhere in the args.
			if (effective === "kill") {
				for (let i = at + 1; i < tokens.length; i++)
					if (isPid(tokens[i]) && pids.has(Number(tokens[i]))) return true;
				continue;
			}
			// pkill/killall/skill <name> | -f <pattern> | <pid>
			if (
				effective === "pkill" ||
				effective === "killall" ||
				effective === "skill"
			) {
				let fullMatch = false;
				for (let i = at + 1; i < tokens.length; i++) {
					const w = lower[i];
					if (w === "-f" || w === "--full") {
						fullMatch = true;
						continue;
					}
					if (w.startsWith("-") && w.length > 1) continue; // -9, -signal TERM
					// First non-flag token is the target (pattern, name, or pid).
					if (fullMatch) {
						if (patternTargetsSelf(tokens[i], ctx)) return true;
					} else if (isPid(tokens[i])) {
						if (pids.has(Number(tokens[i]))) return true;
					} else if (isSelfProcessName(tokens[i], ctx)) {
						return true;
					}
					fullMatch = false;
				}
			}
		}
		// Shell-invocation forms: sh -c "kill 123", bash -c "pkill -f stellarc".
		if (
			(lower[0] === "sh" || lower[0] === "bash" || lower[0] === "zsh") &&
			lower.includes("-c")
		) {
			if (isSelfKillCommand(null, tokens.slice(2).join(" "), ctx)) return true;
		}
	}
	return false;
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
				// Self-kill guard FIRST (NEVR-229), before policy: a command
				// that would signal this node, its harness child, or the
				// supervisor is never parked, never asked — an approval card
				// whose grant would kill the runtime holding the session is
				// not a decision a human should be offered. Refuse it here,
				// record the refusal as an approval item, and let the
				// harness proceed past it.
				if (
					isSelfKillCommand(toolName, p.toolCall.rawInput, {
						nodePid: process.pid,
						harnessPid: child.pid ?? null,
						harnessCommand: harness.command,
					})
				) {
					folder.approval({
						request: {
							sessionId: p.sessionId,
							toolCallId: p.toolCall.toolCallId,
							toolName,
							title: p.toolCall.title ?? null,
							options: p.options.map((o) => ({
								optionId: o.optionId,
								name: o.name,
								kind: o.kind,
							})),
							arguments: p.toolCall.rawInput ?? null,
						},
						status: "rejected_self_kill",
						decidedAt: new Date().toISOString(),
						decidedBy: "node:refuse-self-kill",
					});
					await flush(true).catch((e) =>
						hooks.log?.(`self-kill refusal flush failed: ${e}`),
					);
					hooks.log?.(
						`refused self-kill permission request: tool=${toolName ?? "?"} toolCallId=${p.toolCall.toolCallId}`,
					);
					return denyPermission(p.options);
				}
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
	// Set when a heartbeat 409d (NEVR-229): the plane took the attempt away
	// — lease expired and was reaped into a requeue, or the row went terminal
	// by another path. The run must wind down and its partial transcript ride
	// the finish report; nothing this node POSTs mid-run can land anymore.
	let leaseLost = false;
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
	// Once the run is known-terminal (cancel observed, lease lost) the timer
	// stops draining: everything still in the folder must wait for the
	// teardown take, or a timer flush would POST against the terminal row,
	// 409, and drop the very items this run is trying to preserve (NEVR-229).
	const flushTimer = setInterval(() => {
		if (cancelled || leaseLost) return;
		void flush().catch(() => {});
	}, 500);
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
			// A 409 from the heartbeat means this node no longer owns the
			// attempt (NEVR-229): treat as lease-lost, settle any parked
			// request so the harness can wind down, and stop ACP-cancel
			// spamming a session the plane no longer tracks. Any other error
			// (network blip) stays transient as before.
			if (/409|conflict/i.test(String(error))) {
				leaseLost = true;
				settleParked("cancelled");
				if (sessionId) await conn.cancel({ sessionId }).catch(() => {});
			} else {
				hooks.log?.(`heartbeat failed: ${error}`);
			}
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
			const text = task.agent.instructions
				? `${task.agent.instructions}\n\n---\n\n${task.prompt}`
				: task.prompt;
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
	// Interrupt marking (NEVR-229): if a chunk stream is still open the run
	// ended mid-stream — the partial item stays, marked with WHY. Ordering
	// matters: `drive` resolving its prompt normally means the harness closed
	// its own streams; only an open item at this point was interrupted.
	const openAtTeardown = folder.hasOpen();
	const reason: InterruptReason | null = leaseLost
		? "lease_lost"
		: cancelled
			? "operator_cancel"
			: outcome.outcome === "failed" && openAtTeardown
				? "harness_exit"
				: null;
	if (reason !== null) folder.markInterrupted(reason);
	if (leaseLost || cancelled) {
		// Terminal row (operator cancel or lost lease): appendItems would
		// 409, so the tail travels with the finish report — the plane
		// records it on a cancelled row exactly like pushes (NEVR-199
		// precedent, the closer fit than relaxing appendItems).
		const items = folder.take(true);
		if (items.length) outcome = { ...outcome, finalItems: items };
	} else {
		// Row still resumable: the final flush lands as before (this also
		// delivers a harness_exit-marked partial — a failed run's row is
		// still running until its own finish report lands).
		await flush(true).catch((error) =>
			hooks.log?.(`final flush failed: ${error}`),
		);
	}
	child.kill("SIGTERM");
	const killer = setTimeout(() => child.kill("SIGKILL"), 3000);
	await Promise.race([exited, new Promise((r) => setTimeout(r, 3500))]);
	clearTimeout(killer);
	// A lease-lost run reports cancelled: its finish must land on whatever row
	// state the plane now holds (requeued or terminal) and carry the tail.
	if (leaseLost)
		return {
			outcome: "cancelled",
			stopReason: "cancelled",
			...(outcome.finalItems ? { finalItems: outcome.finalItems } : {}),
		};
	return cancelled && outcome.outcome !== "completed"
		? { ...outcome, outcome: "cancelled", stopReason: "cancelled" }
		: outcome;
}
