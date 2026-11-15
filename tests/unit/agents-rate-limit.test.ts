import { expect, test } from "vitest";
import {
	stopOutcome,
	thrownCause,
	thrownFailure,
} from "../../apps/stellarc-node/src/runner";
import {
	classifyProviderCapacity,
	FAILURE_CODES,
	isRetryable,
	PROVIDER_CAPACITY_PHRASES,
	PROVIDER_CAPACITY_TOKENS,
	PROVIDER_RATE_BACKOFF_BASE_SECONDS,
	PROVIDER_RATE_BACKOFF_CAP_SECONDS,
	parseRetryAfterSeconds,
	providerRateBackoffSeconds,
} from "../../packages/agents/src/protocol";

/** ACP SDK RequestError shape (jsonrpc.js): an Error whose `code` and `data`
 * ride beside the message — Kiro's throttle report reaches the runner's
 * catch path exactly like this. */
const acpError = (message: string, data?: unknown) =>
	Object.assign(new Error(message), {
		name: "RequestError",
		code: -32603,
		...(data !== undefined ? { data } : {}),
	});

// ── failure code + retryability (acceptance 1) ──────────────────────────────

test("FAILURE_CODES carries platform.provider_rate_limited and the unchanged prefix test makes it retryable", () => {
	expect(FAILURE_CODES).toContain("platform.provider_rate_limited");
	expect(isRetryable("platform.provider_rate_limited")).toBe(true);
	// The prefix test, unchanged: every platform.* retries, no agent_error.*.
	for (const code of FAILURE_CODES)
		expect(isRetryable(code)).toBe(code.startsWith("platform."));
	expect(isRetryable("agent_error.prompt_failed")).toBe(false);
});

// ── the Kiro fixture and its control (acceptance 2/3) ───────────────────────

test("a Kiro-style -32603 whose data carries the throttle phrase classifies provider_rate_limited, raw cause preserved", () => {
	const error = acpError(
		"Internal error",
		"The request was throttled by the service because you exceeded your quota. Retry-After: 42",
	);
	const out = thrownFailure(error, "some stderr tail");
	expect(out.outcome).toBe("failed");
	expect(out.failureCode).toBe("platform.provider_rate_limited");
	// The raw message is preserved verbatim in failureMessage (Multica #10677:
	// the raw error was already shown; only the LABEL was wrong) — plus the
	// data blob the real cause rode in, and the stderr tail, in the
	// pre-classification shape.
	expect(out.failureMessage).toContain("Internal error");
	expect(out.failureMessage).toContain("request was throttled by the service");
	expect(out.failureMessage).toContain("some stderr tail");
});

test("the throttle phrase in the message itself (no data) classifies too", () => {
	const out = thrownFailure(
		acpError("session/prompt: The request was throttled by the service"),
		"",
	);
	expect(out.failureCode).toBe("platform.provider_rate_limited");
});

test("a bare Internal error -32603 stays platform.protocol_error", () => {
	const out = thrownFailure(acpError("Internal error"), "");
	expect(out.failureCode).toBe("platform.protocol_error");
	expect(out.failureMessage).toBe("Internal error");
});

test("plain JS errors and object throws keep the protocol_error bin and message extraction", () => {
	expect(thrownFailure(new Error("boom at initialize"), "").failureCode).toBe(
		"platform.protocol_error",
	);
	expect(thrownFailure({ weird: true }, "").failureMessage).toContain("weird");
	expect(thrownFailure("string throw", "").failureMessage).toContain(
		"string throw",
	);
	// The classifier sees the stringified data too: a capacity phrase buried
	// in a structured data blob still classifies.
	expect(
		thrownFailure(acpError("x", { detail: "capacity" }), "").failureCode,
	).toBe("platform.provider_rate_limited");
});

// ── unknown stop reason stays prompt_failed (acceptance 4) ──────────────────

test("an unknown stop reason still maps to agent_error.prompt_failed — the table path never classifies", () => {
	const out = stopOutcome("harness_made_this_up");
	expect(out.outcome).toBe("failed");
	expect(out.failureCode).toBe("agent_error.prompt_failed");
	expect(out.stopReason).toBe("harness_made_this_up");
	// Mapped reasons keep their typed outcomes.
	expect(stopOutcome("end_turn")).toEqual({
		outcome: "completed",
		stopReason: "end_turn",
	});
	expect(stopOutcome("refusal").failureCode).toBe("agent_error.refusal");
});

// ── bounded tokens, full phrases (acceptance 5) ─────────────────────────────

test("429/529 match as bounded tokens: 4290 does NOT classify, HTTP 429 and error 529 do", () => {
	// The exact over-trigger Multica's law forbids: a token count inside an
	// error message must never look like the HTTP status.
	expect(classifyProviderCapacity("…totalTokens: 4290, input: 900…")).toBe(
		false,
	);
	expect(classifyProviderCapacity("credits used: 1429 of 5000")).toBe(false);
	expect(classifyProviderCapacity("HTTP 429 Too Many Requests")).toBe(true);
	expect(classifyProviderCapacity("error 529 from upstream")).toBe(true);
	expect(classifyProviderCapacity("429")).toBe(true);
	expect(classifyProviderCapacity("took 5291ms")).toBe(false);
});

test("word/phrase markers match full-phrase, case-insensitive", () => {
	expect(classifyProviderCapacity("RATE LIMIT exceeded")).toBe(true);
	expect(classifyProviderCapacity("You are rate limited; slow down")).toBe(
		true,
	);
	expect(classifyProviderCapacity("The server is Overloaded")).toBe(true);
	expect(classifyProviderCapacity("insufficient CAPACITY")).toBe(true);
	expect(
		classifyProviderCapacity("The request was throttled by the service."),
	).toBe(true);
	// Generic envelopes without a capacity phrase stay unclassified.
	expect(classifyProviderCapacity("Internal error")).toBe(false);
	expect(classifyProviderCapacity("connection reset by peer")).toBe(false);
	expect(classifyProviderCapacity("tool timed out after 30s")).toBe(false);
});

test("the marker table is exactly the shared table — no provider-specific code anywhere else", () => {
	expect([...PROVIDER_CAPACITY_TOKENS]).toEqual(["429", "529"]);
	expect([...PROVIDER_CAPACITY_PHRASES]).toEqual([
		"rate limit",
		"overloaded",
		"capacity",
		"request was throttled by the service",
	]);
});

// ── thrownCause: the wrapped cause carries the JSON-RPC data blob ───────────

test("thrownCause appends the SDK's data blob to the message", () => {
	expect(thrownCause(acpError("Internal error", "throttled"))).toBe(
		"Internal error throttled",
	);
	expect(thrownCause(acpError("plain"))).toBe("plain");
	expect(thrownCause(acpError("x", { a: 1 }))).toContain('{"a":1}');
});

// ── backoff schedule and Retry-After parsing (park lane inputs) ─────────────

test("backoff escalates 30s doubling to a 10-minute cap per park", () => {
	expect(PROVIDER_RATE_BACKOFF_BASE_SECONDS).toBe(30);
	expect(PROVIDER_RATE_BACKOFF_CAP_SECONDS).toBe(600);
	expect(providerRateBackoffSeconds(1, null)).toBe(30);
	expect(providerRateBackoffSeconds(2, null)).toBe(60);
	expect(providerRateBackoffSeconds(3, null)).toBe(120);
	expect(providerRateBackoffSeconds(4, null)).toBe(240);
	expect(providerRateBackoffSeconds(5, null)).toBe(480);
	expect(providerRateBackoffSeconds(6, null)).toBe(600); // capped
	expect(providerRateBackoffSeconds(50, null)).toBe(600); // still capped
});

test("a parseable Retry-After wins over the schedule, capped at 10 minutes", () => {
	expect(providerRateBackoffSeconds(1, 42)).toBe(42);
	expect(providerRateBackoffSeconds(1, 0)).toBe(0); // "retry now" honored
	expect(providerRateBackoffSeconds(1, 9999)).toBe(600); // capped
	// The schedule applies only when no Retry-After parsed.
	expect(providerRateBackoffSeconds(1, null)).toBe(30);
});

test("parseRetryAfterSeconds reads seconds and HTTP-dates, tolerant of header-ish spellings", () => {
	const now = Date.parse("2026-11-15T12:00:00Z");
	expect(parseRetryAfterSeconds("throttled. Retry-After: 42", now)).toBe(42);
	expect(parseRetryAfterSeconds("retry_after=120", now)).toBe(120);
	expect(
		parseRetryAfterSeconds("Retry-After: Mon, 16 Nov 2026 00:00:00 GMT", now),
	).toBe(43_200);
	// A past date answered the pacing question: retry now, not "no hint".
	expect(
		parseRetryAfterSeconds("Retry-After: Sun, 15 Nov 2026 00:00:00 GMT", now),
	).toBe(0);
	// Absent or garbage is no hint at all.
	expect(parseRetryAfterSeconds("just throttled", now)).toBeNull();
	expect(parseRetryAfterSeconds("Retry-After: soon-ish", now)).toBeNull();
	expect(parseRetryAfterSeconds("Retry-After: 42x", now)).toBeNull();
});
