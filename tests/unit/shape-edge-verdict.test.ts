import { expect, test } from "vitest";

// S13: the edge-verdict tool's decision logic, unit-tested against synthetic
// captures (first-byte latency + inter-frame deltas) - the live quick-tunnel
// numbers are orchestrator-run evidence for ADR 0012, not a CI gate.

const { verdictFromCapture, validateReport } = await import(
	"../../tools/measure-edge-sse"
);

test("S13 verdict logic: streaming vs buffered synthetic captures", () => {
	// A streaming capture: headers at ~120ms, frames paced ~200ms apart.
	const streaming = {
		url: "https://x.trycloudflare.com/orgs/o/v1/shape",
		httpVersion: "HTTP/2",
		firstByteMs: 120,
		frames: [
			{ atMs: 130, kind: "data" as const },
			{ atMs: 345, kind: "data" as const },
			{ atMs: 560, kind: "data" as const },
			{ atMs: 720, kind: "comment" as const },
		],
	};
	expect(verdictFromCapture(streaming)).toBe("streaming");
	// A buffered capture: one late first byte, then everything at once.
	const buffered = {
		url: "https://x.trycloudflare.com/orgs/o/v1/shape",
		httpVersion: "HTTP/2",
		firstByteMs: 20400,
		frames: [
			{ atMs: 20410, kind: "data" as const },
			{ atMs: 20412, kind: "data" as const },
			{ atMs: 20415, kind: "comment" as const },
		],
	};
	expect(verdictFromCapture(buffered)).toBe("buffered");
	// Ambiguous middle: first byte fast but frames clustered at cycle close
	// (a comment-only keep-alive path through a ka-hostile proxy).
	const clustered = {
		url: "https://x.trycloudflare.com/orgs/o/v1/shape",
		httpVersion: "HTTP/2",
		firstByteMs: 150,
		frames: [
			{ atMs: 160, kind: "data" as const },
			{ atMs: 20150, kind: "data" as const },
			{ atMs: 20155, kind: "comment" as const },
		],
	};
	expect(verdictFromCapture(clustered)).toBe("buffered");
});

test("S13 report schema is validated (required keys and types)", () => {
	expect(() =>
		validateReport({
			url: "https://x.trycloudflare.com/orgs/o/v1/shape",
			verdict: "streaming",
			httpVersion: "HTTP/2",
			firstByteMs: 120,
			interFrameGapMsP50: 210,
			cycles: 1,
			generatedAt: "2026-09-17T00:00:00.000Z",
			tool: "measure-edge-sse",
		}),
	).not.toThrow();
	for (const bad of [
		{},
		{ verdict: "maybe" },
		{ verdict: "buffered" },
		{ verdict: "streaming", firstByteMs: "120" },
	]) {
		expect(() => validateReport(bad)).toThrow();
	}
});
