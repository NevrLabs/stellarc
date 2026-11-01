import { expect, test } from "vitest";
import {
	RESUME_ITEM_RENDER_CAP as RENDER_CAP,
	renderResumeDigest,
} from "../../apps/stellarc-node/src/runner";
import type { ResumeItem } from "../../packages/agents/src/protocol";
import {
	capReplayItems,
	RESUME_TOKEN_BUDGET,
} from "../../packages/agents/src/store";

const at = "2026-11-01T00:00:00.000Z";
const item = (
	seq: number,
	kind: ResumeItem["kind"],
	body: unknown,
): ResumeItem => ({
	seq,
	kind,
	body,
	occurredAt: at,
});

// ── capReplayItems (NEVR-415): tail-kept token budget on the replay payload ──

test("resume cap keeps the tail within the budget and counts the omitted head", () => {
	// Five replayable items, ~40k chars each: budget (24k tokens ≈ 96k chars)
	// fits only the newest two.
	const fat = (seq: number) =>
		item(seq, "message", { text: "x".repeat(40_000) });
	const { items, omitted } = capReplayItems([
		fat(1),
		fat(2),
		fat(3),
		fat(4),
		fat(5),
	]);
	expect(items.map((i) => i.seq)).toEqual([4, 5]);
	expect(omitted).toBe(3);
});

test("resume cap filters bookkeeping kinds before budgeting — they neither ride the payload nor count as omitted", () => {
	const { items, omitted } = capReplayItems([
		item(1, "usage", { contextTokens: 800 }),
		item(2, "config", { model: "fake-large", applied: true }),
		item(3, "harness_meta", { subtype: "plan", data: {} }),
		item(4, "message", { role: "assistant", content: [] }),
	]);
	expect(items.map((i) => i.seq)).toEqual([4]);
	expect(omitted).toBe(0);
});

test("resume cap always keeps the newest item, even oversized, and tolerates an empty prior", () => {
	const giant = capReplayItems([
		item(1, "tool_result", { output: "y".repeat(RESUME_TOKEN_BUDGET * 8) }),
	]);
	expect(giant.items).toHaveLength(1);
	expect(giant.omitted).toBe(0);
	expect(capReplayItems([])).toEqual({ items: [], omitted: 0 });
	// A prior that is ALL bookkeeping replays nothing — a digest header with
	// zero items, never a fabricated transcript.
	const none = capReplayItems([item(1, "usage", { tokensTotal: 5 })]);
	expect(none).toEqual({ items: [], omitted: 0 });
});

// ── renderResumeDigest (NEVR-415): the prompt block that seeds the session ──

const digestOf = (items: ResumeItem[], omitted = 0) =>
	renderResumeDigest({
		fromAttempt: 1,
		failureCode: "platform.lease_expired",
		items,
		omitted,
	});

test("resume digest renders every replayable kind compactly", () => {
	const digest = digestOf([
		item(0, "message", {
			role: "user",
			content: [{ type: "text", text: "fix the flaky test" }],
		}),
		item(1, "thinking", { text: "the timer is racy" }),
		item(2, "tool_call", {
			call_id: "call-1",
			title: "Run tests",
			kind: "execute",
			status: "pending",
			input: { command: "bun test" },
		}),
		item(3, "tool_result", {
			call_id: "call-1",
			status: "completed",
			is_error: false,
			title: "Run tests",
			content: [],
			output: { pass: 41, fail: 1 },
		}),
		item(4, "approval", {
			request: { toolName: "deploy", arguments: { target: "prod" } },
			status: "granted",
		}),
		item(5, "push", {
			commitSha: "0123456789abcdef0123456789abcdef01234567",
			ref: "refs/remotes/origin/main",
		}),
		item(6, "resumed_from", { resumedFromAttempt: 1 }),
	]);
	expect(digest).toContain("## Prior attempt context (attempt 1)");
	expect(digest).toContain("platform.lease_expired");
	expect(digest).toContain("Continue the task from where the transcript ends");
	expect(digest).toContain("[user] fix the flaky test");
	expect(digest).toContain("[thought] the timer is racy");
	expect(digest).toContain(
		'[tool_call Run tests (call-1)] {"command":"bun test"}',
	);
	expect(digest).toContain(
		'[tool_result completed (call-1)] {"pass":41,"fail":1}',
	);
	expect(digest).toContain('[permission granted deploy] {"target":"prod"}');
	expect(digest).toContain("[pushed 0123456789 → refs/remotes/origin/main]");
	expect(digest).toContain("[resumed from attempt 1]");
	// oldest first — the digest preserves transcript order
	expect(digest.indexOf("[user] fix the flaky test")).toBeLessThan(
		digest.indexOf("[tool_result completed (call-1)]"),
	);
});

test("resume digest truncates pathological items and notes the omitted head", () => {
	const digest = digestOf(
		[
			item(0, "message", {
				role: "assistant",
				content: [{ type: "text", text: "z".repeat(99_000) }],
			}),
		],
		2,
	);
	expect(digest).toContain("[truncated");
	expect(digest.length).toBeLessThan(RENDER_CAP * 2);
	expect(digest).toContain("(2 older item(s) omitted for length)");
});

test("resume digest skips bookkeeping kinds instead of dumping raw bodies", () => {
	const digest = digestOf([
		item(0, "usage", { contextTokens: 800 }),
		item(1, "harness_meta", { subtype: "plan", data: { secret: "nope" } }),
		item(2, "message", {
			role: "assistant",
			content: [{ type: "text", text: "kept" }],
		}),
	]);
	expect(digest).toContain("[assistant] kept");
	expect(digest).not.toContain("contextTokens");
	expect(digest).not.toContain("secret");
});
