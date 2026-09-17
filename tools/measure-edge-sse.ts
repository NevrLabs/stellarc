// STL-25 S13: credential-free Cloudflare edge verdict for SSE transport.
//
// Verdict logic is pure and unit-tested (tests/unit/shape-edge-verdict.test.ts):
// a capture is `streaming` when frames traverse with healthy inter-frame gaps
// after a fast first byte, `buffered` when either the first byte or the frame
// cluster arrives at cycle-close latency (the whole-body-buffering signature).
//
// Usage (orchestrator-run, CI-independent):
//   bun tools/measure-edge-sse.ts --origin http://127.0.0.1:PORT
//     [--org org-a] [--cycles 2] [--out docs/evidence/edge-sse-report.json]
//
// Spawns `cloudflared tunnel --url <origin>` (quick tunnel, no CF account,
// credentials, or login), reads the printed trycloudflare.com URL, opens ONE
// qualifying SSE request through the edge, times first byte + every frame,
// closes at the cycle boundary, and writes the report JSON.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface CapturedFrame {
	atMs: number;
	kind: "data" | "comment";
}

export interface EdgeCapture {
	url: string;
	httpVersion: string;
	firstByteMs: number;
	frames: CapturedFrame[];
}

export type EdgeVerdict = "streaming" | "buffered";

/** Streaming threshold: a first byte past this smells like whole-body hold. */
export const FIRST_BYTE_BUFFERED_MS = 5000;
/** Streaming threshold: inter-frame gaps past this (after first byte) smell
 * like a proxy that flushes only at upstream close. */
export const INTER_FRAME_BUFFERED_MS = 2000;

export function verdictFromCapture(capture: EdgeCapture): EdgeVerdict {
	if (capture.firstByteMs >= FIRST_BYTE_BUFFERED_MS) return "buffered";
	const dataFrames = capture.frames.filter((f) => f.kind === "data");
	if (dataFrames.length >= 2) {
		for (let i = 1; i < dataFrames.length; i++) {
			if (
				dataFrames[i].atMs - dataFrames[i - 1].atMs >=
				INTER_FRAME_BUFFERED_MS
			)
				return "buffered";
		}
	} else if (capture.frames.length >= 2) {
		for (let i = 1; i < capture.frames.length; i++) {
			if (
				capture.frames[i].atMs - capture.frames[i - 1].atMs >=
				INTER_FRAME_BUFFERED_MS
			)
				return "buffered";
		}
	}
	return "streaming";
}

export interface EdgeReport {
	tool: string;
	generatedAt: string;
	url: string;
	httpVersion: string;
	verdict: EdgeVerdict;
	firstByteMs: number;
	interFrameGapMsP50: number;
	cycles: number;
}

export function validateReport(input: unknown): asserts input is EdgeReport {
	if (typeof input !== "object" || input === null)
		throw new Error("not an object");
	const r = input as Record<string, unknown>;
	if (r.verdict !== "streaming" && r.verdict !== "buffered")
		throw new Error(`bad verdict: ${String(r.verdict)}`);
	if (typeof r.firstByteMs !== "number") throw new Error("firstByteMs missing");
	if (typeof r.httpVersion !== "string" || !r.httpVersion)
		throw new Error("httpVersion missing");
	if (typeof r.generatedAt !== "string" || !r.generatedAt)
		throw new Error("generatedAt missing");
	if (typeof r.tool !== "string" || !r.tool) throw new Error("tool missing");
	if (typeof r.interFrameGapMsP50 !== "number")
		throw new Error("interFrameGapMsP50 missing");
	if (typeof r.cycles !== "number") throw new Error("cycles missing");
	if (typeof r.url !== "string" || !r.url) throw new Error("url missing");
}

const p50 = (values: number[]) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

async function main() {
	const args = process.argv.slice(2);
	const argValue = (name: string, fallback: string) => {
		const i = args.indexOf(name);
		return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
	};
	const origin = argValue("--origin", "http://127.0.0.1:0");
	const org = argValue("--org", "org-a");
	const cycles = Number(argValue("--cycles", "2"));
	const out = argValue("--out", "docs/evidence/edge-sse-report.json");
	if (origin.endsWith(":0")) {
		console.error("Pass --origin <url> (the shape API origin to expose).");
		process.exit(2);
	}
	// Quick tunnel: no credentials. trycloudflare.com URL on stdout.
	const child = spawn(
		"cloudflared",
		["tunnel", "--url", origin, "--no-autoupdate", "--protocol", "http2"],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let tunnelUrl = "";
	await new Promise<void>((resolve) => {
		const scan = (chunk: Buffer) => {
			const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(
				chunk.toString(),
			);
			if (m) {
				tunnelUrl = m[0];
				resolve();
			}
		};
		child.stdout.on("data", scan);
		child.stderr.on("data", scan);
		setTimeout(() => resolve(), 20000);
	});
	if (!tunnelUrl) {
		console.error("No trycloudflare.com URL within 20s - aborting.");
		child.kill("SIGKILL");
		process.exit(3);
	}
	console.log(`tunnel: ${tunnelUrl}`);
	const headers = {
		authorization: `Bearer ${org}`,
		accept: "text/event-stream",
	};
	// Establish a handle first (snapshot through the edge, JSON mode).
	const base = `${tunnelUrl}/orgs/${org}/v1/shape?table=sync_probe`;
	const initial = await fetch(`${base}&offset=-1`, { headers });
	await initial.text();
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	// Held-open SSE through the edge; time first byte and each frame.
	const began = Date.now();
	const response = await fetch(
		`${base}&offset=${offset}&handle=${handle}&live=true&live_sse=true&experimental_live_sse=true`,
		{ headers },
	);
	const firstByteMs = Date.now() - began;
	const httpVersion =
		(response as Response & { httpProtocol?: string }).httpProtocol ??
		"unknown";
	const frames: CapturedFrame[] = [];
	const reader = response.body?.getReader();
	if (!reader) throw new Error("capture response had no body");
	const decoder = new TextDecoder();
	const cycleDeadline = Date.now() + 21000 * cycles;
	try {
		for (;;) {
			const { done, value } = await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("capture window elapsed")),
						Math.max(1, cycleDeadline - Date.now()),
					),
				),
			]);
			if (done) break;
			const text = decoder.decode(value);
			for (const line of text.split("\n")) {
				if (line.startsWith("data: "))
					frames.push({ atMs: Date.now() - began, kind: "data" as const });
				else if (line.startsWith(":"))
					frames.push({ atMs: Date.now() - began, kind: "comment" as const });
			}
		}
	} catch {
		// window elapsed or stream closed - the capture is what it is
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	const capture: EdgeCapture = {
		url: tunnelUrl,
		httpVersion,
		firstByteMs,
		frames,
	};
	const verdict = verdictFromCapture(capture);
	const gaps: number[] = [];
	for (let i = 1; i < frames.length; i++)
		gaps.push(frames[i].atMs - frames[i - 1].atMs);
	const report: EdgeReport = {
		tool: "measure-edge-sse",
		generatedAt: new Date().toISOString(),
		url: tunnelUrl,
		httpVersion,
		verdict,
		firstByteMs,
		interFrameGapMsP50: p50(gaps),
		cycles,
	};
	validateReport(report);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(report, null, "\t")}\n`);
	console.log(JSON.stringify(report, null, 2));
	child.kill("SIGTERM");
	process.exit(0);
}

const isDirectRun = process.argv[1]?.endsWith("measure-edge-sse.ts");
if (isDirectRun) await main();
