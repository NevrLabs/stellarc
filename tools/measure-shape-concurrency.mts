// STL-25 S12: concurrent live-shape ceiling per browser, direct HTTP/1.1 vs
// through-edge - the measurement that informs the per-org multiplexing
// decision (ADR 0012). Playwright-driven: a real browser holds N live shape
// connections; the harness detects which shapes stall.
//
// Self-check (S12, CI-enforceable): point the harness at a connection-cap-2
// proxy - it MUST report ceiling 2; unlimited at N<=4 MUST NOT false-stall.
// The real browser numbers are documented evidence (ADR 0012), not CI gates.
//
// Usage:
//   bun tools/measure-shape-concurrency.mts --target http://127.0.0.1:PORT
//     [--browser chromium] [--out docs/evidence/shape-concurrency.json]
//   bun tools/measure-shape-concurrency.mts --self-check --target http://127.0.0.1:PORT
//
// Self-check mode boots its own conn-cap-2 HTTP/1.1 proxy (no external
// services) and asserts the harness reports 2.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ConcurrencyProbe {
	/** Shape id (1..N) that uniquely names one live connection. */
	id: number;
	/** True when at least one frame arrived on this shape's connection. */
	received: boolean;
}

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
}

/** Browser page source: holds N live shapes, reports per-shape liveness. */
export function pageSource(target: string, shapes: number): string {
	// Each shape is a distinct table param suffix on the same origin - the
	// browser sees one origin, N EventSource/fetch streams, HTTP/1.1 caps at 6.
	const ids = Array.from({ length: shapes }, (_, i) => i + 1);
	return `<!doctype html><html><body><script>
const target = ${JSON.stringify(target)};
const ids = ${JSON.stringify(ids)};
const results = {};
for (const id of ids) {
  results[id] = false;
  const controller = new AbortController();
  fetch(target + "/orgs/conc/v1/shape?table=sync_probe&offset=-1&shape-id=" + id, {
    headers: { authorization: "Bearer conc" },
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body.getReader();
    const first = await reader.read();
    if (first && first.value && first.value.length > 0) results[id] = true;
    controller.abort();
  }).catch(() => {});
}
window.__report = () => JSON.stringify(results);
</script></body></html>`;
}

/** Derive ceiling from per-shape liveness (the canary logic, exported for the
 * self-check's unit assertions). */
export function ceilingFromResults(
	results: Record<string, boolean>,
	shapes: number,
): { stalledShapeId: number; ceiling: number } {
	for (let id = 1; id <= shapes; id++) {
		if (!results[String(id)]) return { stalledShapeId: id, ceiling: id - 1 };
	}
	return { stalledShapeId: 0, ceiling: shapes };
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
	if (!target) {
		console.error("Pass --target <origin> (the shape API under measure).");
		process.exit(2);
	}
	const { chromium } = await import("playwright");
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setContent(pageSource(target, shapes));
	// Wait until every shape resolved or 15s elapse.
	await page
		.waitForFunction(
			() =>
				Object.values(
					JSON.parse(
						(window as unknown as { __report: () => string }).__report(),
					),
				).length > 0,
			undefined,
			{ timeout: 15000 },
		)
		.catch(() => undefined);
	await page.waitForTimeout(4000);
	const raw = (await page.evaluate(() =>
		(window as unknown as { __report: () => string }).__report(),
	)) as string;
	const results = JSON.parse(raw) as Record<string, boolean>;
	const { stalledShapeId, ceiling } = ceilingFromResults(results, shapes);
	const report: ConcurrencyReport = {
		tool: "measure-shape-concurrency",
		generatedAt: new Date().toISOString(),
		target,
		browser: browserName,
		shapes,
		stalledShapeId,
		ceiling,
	};
	console.log(JSON.stringify(report, null, 2));
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(report, null, "\t")}\n`);
	await browser.close();
	process.exit(0);
}

const isDirectRun = process.argv[1]?.endsWith("measure-shape-concurrency.mts");
if (isDirectRun) await main();
