// Renders the Grafana Tempo trace view for a trace id and VERIFIES in the DOM
// that the expected spans are visible, then screenshots. Exit 1 if the spans
// never render (so a login page or error banner can't pass as evidence).
// Usage: bun tools/shoot-grafana-trace.mts <traceId32Hex> [outPath]
import { chromium } from "@playwright/test";

const traceId = process.argv[2];
if (!traceId || !/^[0-9a-f]{32}$/.test(traceId)) {
	console.error(
		"usage: bun tools/shoot-grafana-trace.mts <traceId32Hex> [out.png]",
	);
	process.exit(2);
}
const out = process.argv[3] ?? "docs/evidence/otel-export-tempo.png";
const panes = {
	abc: {
		datasource: "tempo",
		queries: [{ refId: "A", queryType: "traceql", query: traceId }],
		range: { from: "now-1h", to: "now" },
	},
};
const url = `http://localhost:3210/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}`;

const browser = await chromium.launch({
	executablePath: "/usr/bin/chromium",
	args: ["--no-sandbox", "--disable-gpu"],
});
try {
	const page = await browser.newPage({
		viewport: { width: 1680, height: 1050 },
	});
	await page.goto(url, { waitUntil: "domcontentloaded" });
	// The trace waterfall renders span rows as collapsible rows with the span
	// name as text; wait up to 45s for OUR span names to appear.
	const wanted = [
		"stellarc.http.request",
		"stellarc.shape.snapshot",
		"stellarc.shape.tail",
	];
	await page.waitForFunction(
		(names: string[]) => {
			const text = document.body.innerText;
			return names.filter((name) => text.includes(name)).length >= 3;
		},
		wanted,
		{ timeout: 45_000 },
	);
	const text = await page.evaluate(() => document.body.innerText);
	const found = wanted.filter((name) => text.includes(name));
	// "Sign in" appears in the header even with anonymous Admin enabled, so it
	// is not a login-wall marker; span presence above is the real gate.
	const errors = ["failed to get trace", "Bad Request"].filter((marker) =>
		text.toLowerCase().includes(marker.toLowerCase()),
	);
	if (errors.length > 0)
		throw new Error(`page shows error state: ${errors.join(", ")}`);
	console.log(`verified spans in DOM: ${found.join(", ")}`);
	await page.screenshot({ path: out, fullPage: false });
	console.log(`wrote ${out}`);
} finally {
	await browser.close();
}
