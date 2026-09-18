// STL-25 S12: concurrent live-shape ceiling per browser, direct HTTP/1.1 vs
// through-edge - the measurement that informs the per-org multiplexing
// decision (ADR 0012).
//
// What it measures: a client holds N live shape connections against ONE
// origin; under HTTP/1.1 that origin allows only ~6 concurrent requests,
// so shape N+1 stalls behind the cap. Each probe mints a REAL snapshot
// session first (offset=-1 -> electric-handle/electric-offset) and then
// holds a qualifying SSE fetch (live=true + handle + offset != -1 +
// live_sse=true + Accept: text/event-stream) open - the exact request the
// stock client sends once up-to-date. A shape counts as live only when a
// frame traverses its held connection. (The pre-c10 harness probed with
// shape-id= (not allowlisted -> 400) and offset=-1 (no held connection):
// it measured nothing.)
//
// Self-check (S12, CI-proven): pointed at a connection-cap-2 proxy the
// harness MUST report ceiling 2, and MUST NOT false-stall at N<=4 through
// an unlimited proxy. The integration legs live in
// tests/integration/shape-proxy.test.ts; `--self-check` runs the same
// harness standalone against a target origin.
//
// Real browser numbers (documented evidence, not a CI gate): the default
// mode drives Chromium - the page NAVIGATES to the target origin so the
// SSE fetches are same-origin and the browser's own HTTP/1.1 pool binds.
//
// Usage:
//   bun tools/measure-shape-concurrency.mts --target http://127.0.0.1:PORT
//     [--shapes 8] [--browser chromium] [--out docs/evidence/shape-concurrency.json]
//   bun tools/measure-shape-concurrency.mts --self-check --target http://127.0.0.1:PORT

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ConcurrencyReport {
	tool: string;
	generatedAt: string;
	target: string;
	browser: string;
	/** Number of live shapes the page held. */
	shapes: number;
	/** First shape id whose connection stalled (0 = none stalled). */
	stalledShapeId: number;
	/** Detected ceiling: stalledShapeId - 1, or shapes when nothing stalled. */
	ceiling: number;
	/** Per-shape liveness behind the report (forensics). */
	results: Record<string, boolean>;
}

/** The shape snapshot URL (offset=-1): the only request allowed without a
 * handle - it mints the session the SSE fetches tail from. */
export function snapshotUrl(
	origin: string,
	org: string,
	table: string,
): string {
	return `${origin}/orgs/${encodeURIComponent(org)}/v1/shape?table=${encodeURIComponent(table)}&offset=-1`;
}

/** Mint one snapshot session (handle + issued offset token). Every SSE
 * probe of a run shares the session - each held connection tails the same
 * shape from the same boundary, exactly like N browser collections. */
export async function mintShapeSession(
	origin: string,
	org: string,
	table: string,
	headers: Record<string, string>,
): Promise<{ handle: string; offset: string }> {
	const snapshot = await fetch(snapshotUrl(origin, org, table), { headers });
	if (snapshot.status !== 200)
		throw new Error(`snapshot probe failed: HTTP ${snapshot.status}`);
	await snapshot.text();
	const handle = snapshot.headers.get("electric-handle") ?? "";
	const offset = snapshot.headers.get("electric-offset") ?? "";
	if (!handle || !offset)
		throw new Error(
			"snapshot response missing electric-handle/electric-offset",
		);
	return { handle, offset };
}

/** Qualifying SSE request for a minted session - the exact combination the
 * negotiation rule upgrades to a held stream (spec \u00a73). */
export function sseStreamUrl(
	origin: string,
	org: string,
	table: string,
	session: { handle: string; offset: string },
): string {
	return (
		`${origin}/orgs/${encodeURIComponent(org)}/v1/shape?table=${encodeURIComponent(table)}` +
		`&offset=${encodeURIComponent(session.offset)}&handle=${encodeURIComponent(session.handle)}` +
		"&live=true&live_sse=true&experimental_live_sse=true"
	);
}

export interface ProbeOptions {
	org?: string;
	table?: string;
	/** Number of concurrent live shapes to hold (default 8). */
	shapes: number;
	/** How long each connection is held before giving up. Default 16000ms:
	 * an idle stream flushes its first boundary at the first ka tick (15s,
	 * gated cadence) - a shorter hold reads silence as a stall. */
	holdMs?: number;
	headers?: Record<string, string>;
}

/** Hold N qualifying SSE connections concurrently and report which shapes
 * actually received a frame. This is the harness's measurement core -
 * shared by the browser run, the --self-check, and the S12 integration
 * self-checks. */
export async function probeShapeLiveness(
	target: string,
	options: ProbeOptions,
): Promise<Record<string, boolean>> {
	const org = options.org ?? "conc";
	const table = options.table ?? "sync_probe";
	const holdMs = options.holdMs ?? 16000;
	const headers = options.headers ?? { authorization: `Bearer ${org}` };
	const session = await mintShapeSession(target, org, table, headers);
	const streamUrl = sseStreamUrl(target, org, table, session);
	const ids = Array.from({ length: options.shapes }, (_, i) => i + 1);
	const controllers = ids.map(() => new AbortController());
	const received: Record<string, boolean> = {};
	for (const id of ids) received[String(id)] = false;
	await Promise.all(
		ids.map(async (id) => {
			// The deadline covers the WHOLE attempt: a connection stuck
			// behind a cap never gets response headers, so the abort is what
			// ends it.
			const timer = setTimeout(() => controllers[id - 1]?.abort(), holdMs);
			try {
				const response = await fetch(streamUrl, {
					headers: { ...headers, accept: "text/event-stream" },
					signal: controllers[id - 1]?.signal,
				});
				if (
					response.status !== 200 ||
					response.headers.get("content-type") !== "text/event-stream"
				)
					return; // not a held stream: the shape counts as stalled
				const reader = response.body?.getReader();
				if (!reader) return;
				// HOLD the connection open (never settle early): under a cap
				// the stalled shapes must see the held sockets, not freed
				// slots.
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value && value.length > 0) received[String(id)] = true;
				}
			} catch {
				// aborted at the deadline or connection failed: stays false
			} finally {
				clearTimeout(timer);
				controllers[id - 1]?.abort();
			}
		}),
	);
	return received;
}

/** Derive ceiling from per-shape liveness (the canary logic, exported for
 * the self-check's unit assertions). */
export function ceilingFromResults(
	results: Record<string, boolean>,
	shapes: number,
): { stalledShapeId: number; ceiling: number } {
	for (let id = 1; id <= shapes; id++) {
		if (!results[String(id)]) return { stalledShapeId: id, ceiling: id - 1 };
	}
	return { stalledShapeId: 0, ceiling: shapes };
}

/** In-page probe source (runs ON the target origin so the SSE fetches are
 * same-origin - the browser's own HTTP/1.1 pooling then binds). Same
 * contract as probeShapeLiveness: hold N qualifying connections, report
 * which received a frame. */
export function browserProbeSource(options: {
	org: string;
	table: string;
	shapes: number;
	holdMs: number;
}): string {
	return `(() => {
const org = ${JSON.stringify(options.org)};
const table = ${JSON.stringify(options.table)};
const holdMs = ${JSON.stringify(options.holdMs)};
const headers = { authorization: "Bearer " + org };
const base = "/orgs/" + encodeURIComponent(org) + "/v1/shape?table=" + encodeURIComponent(table);
return (async () => {
  const snap = await fetch(base + "&offset=-1", { headers });
  if (!snap.ok) throw new Error("snapshot HTTP " + snap.status);
  await snap.text();
  const handle = snap.headers.get("electric-handle") ?? "";
  const offset = snap.headers.get("electric-offset") ?? "";
  if (!handle || !offset) throw new Error("no handle/offset");
  const stream = base +
    "&offset=" + encodeURIComponent(offset) +
    "&handle=" + encodeURIComponent(handle) +
    "&live=true&live_sse=true&experimental_live_sse=true";
  const ids = Array.from({ length: ${JSON.stringify(options.shapes)} }, (_, i) => i + 1);
  const controllers = ids.map(() => new AbortController());
  const received = {};
  for (const id of ids) received[id] = false;
  await Promise.all(ids.map(async (id) => {
    const timer = setTimeout(() => controllers[id - 1].abort(), holdMs);
    try {
      const response = await fetch(stream, {
        headers: { ...headers, accept: "text/event-stream" },
        signal: controllers[id - 1].signal,
      });
      if (response.status !== 200 ||
          response.headers.get("content-type") !== "text/event-stream") return;
      const reader = response.body.getReader();
      if (!reader) return;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) received[id] = true;
      }
    } catch {
    } finally {
      clearTimeout(timer);
      controllers[id - 1].abort();
    }
  }));
  return received;
})();
})()`;
}

async function runSelfCheck(target: string, holdMs: number): Promise<boolean> {
	const { startProxy } = await import("../tests/helpers/proxy-fixture");
	const capped = startProxy(target, { mode: "flush", maxConcurrent: 2 });
	let cappedVerdict: { stalledShapeId: number; ceiling: number };
	let cappedResults: Record<string, boolean>;
	try {
		cappedResults = await probeShapeLiveness(capped.url, {
			shapes: 4,
			holdMs,
		});
		cappedVerdict = ceilingFromResults(cappedResults, 4);
	} finally {
		await capped.close();
	}
	const open = startProxy(target, { mode: "flush" });
	let openVerdict: { stalledShapeId: number; ceiling: number };
	try {
		const results = await probeShapeLiveness(open.url, {
			shapes: 4,
			holdMs,
		});
		openVerdict = ceilingFromResults(results, 4);
	} finally {
		await open.close();
	}
	const cappedOk =
		cappedVerdict.ceiling === 2 && cappedVerdict.stalledShapeId === 3;
	const openOk = openVerdict.stalledShapeId === 0;
	console.log(
		JSON.stringify(
			{
				selfCheck: "S12",
				capped: {
					ceiling: cappedVerdict.ceiling,
					stalledShapeId: cappedVerdict.stalledShapeId,
					results: cappedResults,
					ok: cappedOk,
				},
				unlimited: {
					ceiling: openVerdict.ceiling,
					stalledShapeId: openVerdict.stalledShapeId,
					ok: openOk,
				},
				pass: cappedOk && openOk,
			},
			null,
			2,
		),
	);
	return cappedOk && openOk;
}

async function main() {
	const args = process.argv.slice(2);
	const argValue = (name: string, fallback: string) => {
		const i = args.indexOf(name);
		return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
	};
	const target = argValue("--target", "");
	const shapes = Number(argValue("--shapes", "8"));
	const out = argValue("--out", "docs/evidence/shape-concurrency.json");
	const browserName = argValue("--browser", "chromium");
	const selfCheck = args.includes("--self-check");
	const holdMs = Number(argValue("--hold-ms", "16000"));
	if (!target) {
		console.error("Pass --target <origin> (the shape API under measure).");
		process.exit(2);
	}
	if (selfCheck) {
		const ok = await runSelfCheck(target, holdMs);
		if (!ok) {
			console.error("S12 self-check FAILED (see report above).");
			process.exit(1);
		}
		return;
	}
	const { chromium } = await import("playwright");
	const browser = await chromium.launch();
	const page = await browser.newPage();
	// Navigate to the target origin: the in-page fetches are same-origin, so
	// the BROWSER's HTTP/1.1 connection pool is what binds (the thing being
	// measured). No CORS, no request interception.
	await page.goto(`${target.replace(/\/$/, "")}/health`);
	const results = (await page.evaluate(
		browserProbeSource({ org: "conc", table: "sync_probe", shapes, holdMs }),
	)) as Record<string, boolean>;
	const { stalledShapeId, ceiling } = ceilingFromResults(results, shapes);
	const report: ConcurrencyReport = {
		tool: "measure-shape-concurrency",
		generatedAt: new Date().toISOString(),
		target,
		browser: browserName,
		shapes,
		stalledShapeId,
		ceiling,
		results,
	};
	console.log(JSON.stringify(report, null, 2));
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(report, null, "\t")}\n`);
	await browser.close();
	process.exit(0);
}

const isDirectRun = process.argv[1]?.endsWith("measure-shape-concurrency.mts");
if (isDirectRun) await main();
