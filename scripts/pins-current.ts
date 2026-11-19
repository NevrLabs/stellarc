/**
 * NEVR-724 — pins-current advisory.
 *
 * Reads every package.json in the tree (root + workspace packages, discovered
 * by walking — nothing hardcoded), takes the exact version pins (skipping
 * `workspace:*`, ranges and other non-registry specs), fetches each package's
 * `dist-tags.latest` from registry.npmjs.org (batched, cached per run), and
 * emits a `package | pinned | npm latest | delta` table to stdout — plus
 * `$GITHUB_STEP_SUMMARY` and a PR-comment body file when running in CI.
 *
 * Advisory by construction: a stale pin is information, not a failure. The
 * script always exits 0; registry fetch failures degrade to a warning row
 * (`⚠ fetch failed` / delta `unknown`), never an error. Deliberate holds
 * (effect-suite lockstep timing, hotkeys riders) stay possible — the job
 * reports, the executor decides.
 *
 * Zero dependencies: bun + node stdlib only, so CI needs no `bun install`.
 */

import {
	appendFileSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Dependency sections that carry registry pins. */
const DEP_SECTIONS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
	"overrides",
] as const;

/** Directories never worth scanning for manifests. */
const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	".turbo",
	".cache",
	".next",
	"out",
	"target",
	"test-results",
]);

const REGISTRY = "https://registry.npmjs.org/";
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 15_000;

/** A single exact pin (`name@version`) found in some package.json. */
export type Pin = { name: string; version: string };

/** Comparison outcome of one pin against the registry's `latest`. */
export type Delta = "current" | "stale" | "ahead" | "unknown";

/** One table row: pin, resolved latest (null = fetch failed), verdict. */
export type Row = {
	name: string;
	pinned: string;
	latest: string | null;
	delta: Delta;
};

const DELTA_ORDER: Record<Delta, number> = {
	stale: 0,
	unknown: 1,
	ahead: 2,
	current: 3,
};

const SEMVER_RE =
	/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

type Semver = {
	major: number;
	minor: number;
	patch: number;
	prerelease: string[];
};

function parseSemver(version: string): Semver {
	const match = SEMVER_RE.exec(version);
	if (!match) {
		throw new Error(`not a semver: ${version}`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ? match[4].split(".") : [],
	};
}

/**
 * Semver precedence comparison: -1 if a < b, 0 if equal, 1 if a > b.
 * Build metadata is ignored; a prerelease ranks below its release.
 */
export function compareSemver(a: string, b: string): number {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	for (const key of ["major", "minor", "patch"] as const) {
		if (pa[key] !== pb[key]) {
			return pa[key] < pb[key] ? -1 : 1;
		}
	}
	if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
	if (pa.prerelease.length === 0) return 1;
	if (pb.prerelease.length === 0) return -1;
	const shared = Math.min(pa.prerelease.length, pb.prerelease.length);
	for (let i = 0; i < shared; i++) {
		const x = pa.prerelease[i];
		const y = pb.prerelease[i];
		if (x === y) continue;
		const xNum = /^[0-9]+$/.test(x);
		const yNum = /^[0-9]+$/.test(y);
		if (xNum && yNum) return Number(x) < Number(y) ? -1 : 1;
		if (xNum) return -1; // numeric identifiers rank below alphanumeric
		if (yNum) return 1;
		return x < y ? -1 : 1;
	}
	return pa.prerelease.length - pb.prerelease.length === 0
		? 0
		: pa.prerelease.length < pb.prerelease.length
			? -1
			: 1;
}

/** True only for an exact registry pin (`1.2.3`, `1.2.3-rc.1`). */
export function isExactPin(spec: string): boolean {
	return SEMVER_RE.test(spec);
}

/** Extract the pinned name/version pairs from one parsed package.json. */
export function pinsFromManifest(manifest: unknown): Pin[] {
	if (typeof manifest !== "object" || manifest === null) return [];
	const pins: Pin[] = [];
	for (const section of DEP_SECTIONS) {
		const deps = (manifest as Record<string, unknown>)[section];
		if (typeof deps !== "object" || deps === null) continue;
		for (const [name, spec] of Object.entries(
			deps as Record<string, unknown>,
		)) {
			if (typeof spec === "string" && isExactPin(spec)) {
				pins.push({ name, version: spec });
			}
		}
	}
	return pins;
}

/** Union the pins of many manifests, deduped, deterministically sorted. */
export function collectPins(
	manifests: Array<{ path: string; manifest: unknown }>,
): Pin[] {
	const seen = new Set<string>();
	const pins: Pin[] = [];
	for (const { manifest } of manifests) {
		for (const pin of pinsFromManifest(manifest)) {
			const key = `${pin.name}@${pin.version}`;
			if (!seen.has(key)) {
				seen.add(key);
				pins.push(pin);
			}
		}
	}
	return pins.sort(
		(a, b) =>
			a.name.localeCompare(b.name) || compareSemver(a.version, b.version),
	);
}

/**
 * Read `dist-tags.latest` out of a registry response. Accepts both a full /
 * abbreviated packument (`{"dist-tags":{"latest":"…"}}`) and the `/latest`
 * manifest form (`{"version":"…"}`); undefined when neither is present.
 */
export function latestFromPackument(text: string): string | undefined {
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof doc !== "object" || doc === null) return undefined;
	const record = doc as Record<string, unknown>;
	const distTags = record["dist-tags"];
	if (typeof distTags === "object" && distTags !== null) {
		const latest = (distTags as Record<string, unknown>).latest;
		if (typeof latest === "string") return latest;
	}
	return typeof record.version === "string" ? record.version : undefined;
}

/**
 * Compare pins against resolved `latest` versions. `resolveLatest` returns
 * undefined for a package whose registry fetch failed — that becomes a
 * warning row (delta `unknown`), never an error.
 */
export function computeRows(
	pins: Pin[],
	resolveLatest: (name: string) => string | undefined,
): Row[] {
	return pins
		.map((pin) => {
			const latest = resolveLatest(pin.name);
			const delta: Delta =
				latest === undefined
					? "unknown"
					: compareSemver(pin.version, latest) === 0
						? "current"
						: compareSemver(pin.version, latest) < 0
							? "stale"
							: "ahead";
			return {
				name: pin.name,
				pinned: pin.version,
				latest: latest ?? null,
				delta,
			};
		})
		.sort(
			(a, b) =>
				DELTA_ORDER[a.delta] - DELTA_ORDER[b.delta] ||
				a.name.localeCompare(b.name) ||
				compareSemver(a.pinned, b.pinned),
		);
}

/** Render rows as the markdown `package | pinned | npm latest | delta` table. */
export function formatTable(rows: Row[]): string {
	const lines = [
		"| package | pinned | npm latest | delta |",
		"| --- | --- | --- | --- |",
	];
	for (const row of rows) {
		const latest = row.latest ?? "⚠ fetch failed";
		lines.push(`| ${row.name} | ${row.pinned} | ${latest} | ${row.delta} |`);
	}
	return lines.join("\n");
}

/** Walk the tree from `root`, collecting every package.json path. */
export function discoverPackageJsons(root: string): string[] {
	const found: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
			} else if (entry.name === "package.json") {
				found.push(join(dir, entry.name));
			}
		}
	};
	walk(root);
	return found.sort();
}

async function fetchLatest(name: string): Promise<string | undefined> {
	// Packument first (dist-tags.latest), then the /latest manifest as
	// fallback; both abbreviated (corgi) accept to keep responses small.
	for (const url of [
		`${REGISTRY}${encodeURIComponent(name)}`,
		`${REGISTRY}${encodeURIComponent(name)}/latest`,
	]) {
		try {
			const res = await fetch(url, {
				headers: { accept: "application/vnd.npm.install-v1+json" },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!res.ok) continue;
			const latest = latestFromPackument(await res.text());
			if (latest !== undefined) return latest;
		} catch {
			// fall through to the fallback URL, then to a warning row
		}
	}
	return undefined;
}

/** Batched (pool of CONCURRENCY) registry lookup, cached per run. */
async function fetchAll(
	names: string[],
): Promise<Map<string, string | undefined>> {
	const cache = new Map<string, string | undefined>();
	const queue = [...new Set(names)];
	let cursor = 0;
	const worker = async () => {
		while (cursor < queue.length) {
			const name = queue[cursor++];
			cache.set(name, await fetchLatest(name));
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
	);
	return cache;
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		console.warn(`pins-current: skipping unreadable ${path}: ${err}`);
		return null;
	}
}

async function main(): Promise<void> {
	const root = process.cwd();
	const files = discoverPackageJsons(root);
	const pins = collectPins(
		files.map((path) => ({ path, manifest: readJson(path) })),
	);
	const cache = await fetchAll(pins.map((pin) => pin.name));
	const rows = computeRows(pins, (name) => cache.get(name));
	const table = formatTable(rows);

	console.log(table);

	const stale = rows.filter((r) => r.delta === "stale").length;
	const unknown = rows.filter((r) => r.delta === "unknown").length;
	const summary = [
		"## pins-current advisory",
		"",
		table,
		"",
		`${rows.length} exact pins across ${files.length} package.json files · ${stale} stale · ${unknown} unresolved`,
		"",
		"> Advisory only — stale pins never fail this job; deliberate holds are the executor's call (NEVR-724).",
		"",
	].join("\n");

	// Not a turbo task (CI-only advisory run by pins-current.yml), so turbo
	// cache invalidation does not apply to these runner-provided variables.
	const stepSummary =
		// biome-ignore lint/suspicious/noUndeclaredEnvVars: CI runner env, never a turbo task
		process.env.GITHUB_STEP_SUMMARY;
	if (stepSummary) {
		appendFileSync(stepSummary, summary);
	}
	const runnerTemp =
		// biome-ignore lint/suspicious/noUndeclaredEnvVars: CI runner env, never a turbo task
		process.env.RUNNER_TEMP;
	if (runnerTemp) {
		const marker = "<!-- pins-current -->\n\n";
		writeFileSync(
			join(runnerTemp, "pins-current-comment.md"),
			`${marker}${summary}`,
		);
	}
}

if (import.meta.main) {
	await main().catch((err) => {
		console.error(`pins-current: fatal, but advisory — exiting 0: ${err}`);
		process.exit(0);
	});
}
