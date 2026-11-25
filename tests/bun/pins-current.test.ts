/**
 * NEVR-724 / NEVR-824 — unit test for the pins-current delta computation.
 *
 * Pure-function coverage over scripts/pins-current.ts: fixture package.json
 * set + fixture registry responses inlined as JSON (no network) → exact
 * expected delta table. Required rows per the brief: one pinned==latest
 * (current), one pinned<latest (stale), one workspace:* spec (ignored);
 * plus the specified degradations — range specs ignored, and a failed
 * registry lookup becoming a warning row instead of an error.
 *
 * Cargo half (NEVR-824), same fixture style: fixture Cargo.lock content +
 * fixture crates.io responses (no network) — one pinned==max_stable
 * (current), one pinned<max_stable (stale, the wry 0.57.3/0.57.4 blind
 * spot from the 2026-11-25 triage), one fetch-failed crate (warning row),
 * a tree with no Cargo.lock at all (no-op note), path/git sources
 * excluded, and the exact expected table.
 */

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectCargoPins,
	collectPins,
	compareSemver,
	computeRows,
	discoverCargoLocks,
	formatCargoTable,
	formatTable,
	isExactPin,
	latestFromPackument,
	maxStableFromCrateResponse,
	NO_CARGO_LOCK_NOTE,
	pinsFromCargoLock,
	renderCargoSummary,
} from "../../scripts/pins-current";

/** Fixture package.json set: a root-like manifest + a workspace package. */
const FIXTURE_MANIFESTS = [
	{
		path: "package.json",
		manifest: {
			name: "fixture-root",
			dependencies: {
				"left-pad": "1.3.0", // pinned == npm latest → current
				"effect-suite": "4.1.4", // pinned < npm latest → stale
				"ghost-pkg": "0.9.0", // registry fetch fails → warning row
				"workspace-mate": "workspace:*", // workspace spec → ignored
				"range-dep": "^2.0.0", // range spec, not a pin → ignored
			},
			devDependencies: {
				"stale-dev": "1.0.0", // pinned < npm latest → stale
			},
			overrides: {
				zod: "4.6.7", // pinned > npm latest → ahead
			},
		},
	},
	{
		path: "apps/demo/package.json",
		manifest: {
			name: "@fixture/demo",
			dependencies: {
				"left-pad": "1.3.0", // same pin as root → deduped
			},
		},
	},
];

/**
 * Fixture registry responses, inlined as JSON exactly as the registry would
 * serve them (packument form for the resolvable ones; ghost-pkg deliberately
 * absent so its lookup fails the way a network failure would).
 */
const FIXTURE_REGISTRY_JSON: Record<string, string> = {
	"left-pad": JSON.stringify({ "dist-tags": { latest: "1.3.0" } }),
	"effect-suite": JSON.stringify({ "dist-tags": { latest: "4.2.0" } }),
	"stale-dev": JSON.stringify({ "dist-tags": { latest: "2.0.0" } }),
	zod: JSON.stringify({ "dist-tags": { latest: "4.6.6" } }),
};

/** The same resolver shape main() builds from the batched fetch cache. */
function fixtureResolveLatest(name: string): string | undefined {
	const packument = FIXTURE_REGISTRY_JSON[name];
	if (packument === undefined) return undefined;
	return latestFromPackument(packument);
}

test("isExactPin accepts exact versions only", () => {
	expect(isExactPin("1.2.3")).toBeTrue();
	expect(isExactPin("4.1.4-rc.1")).toBeTrue();
	expect(isExactPin("3.1169.0")).toBeTrue();
	expect(isExactPin("workspace:*")).toBeFalse();
	expect(isExactPin("^1.2.3")).toBeFalse();
	expect(isExactPin("~1.2")).toBeFalse();
	expect(isExactPin("*")).toBeFalse();
	expect(isExactPin("npm:left-pad@1.3.0")).toBeFalse();
	expect(isExactPin("file:../mate")).toBeFalse();
	expect(isExactPin("github:org/repo")).toBeFalse();
	expect(isExactPin("1.2")).toBeFalse();
	expect(isExactPin("v1.2.3")).toBeFalse();
});

test("compareSemver follows semver precedence", () => {
	expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
	expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
	expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0);
	expect(compareSemver("1.0.3", "1.0.10")).toBeLessThan(0);
	// prerelease ranks below its release
	expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
	// numeric identifiers compare numerically, below alphanumeric
	expect(compareSemver("1.0.0-2", "1.0.0-10")).toBeLessThan(0);
	expect(compareSemver("1.0.0-2", "1.0.0-rc")).toBeLessThan(0);
	expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
	// more prerelease fields rank higher at equal prefix
	expect(compareSemver("1.0.0-rc", "1.0.0-rc.1")).toBeLessThan(0);
	// build metadata ignored
	expect(compareSemver("1.0.0+build.5", "1.0.0")).toBe(0);
});

test("collectPins skips workspace/range specs and dedupes across manifests", () => {
	const pins = collectPins(FIXTURE_MANIFESTS);
	expect(pins).toEqual([
		{ name: "effect-suite", version: "4.1.4" },
		{ name: "ghost-pkg", version: "0.9.0" },
		{ name: "left-pad", version: "1.3.0" },
		{ name: "stale-dev", version: "1.0.0" },
		{ name: "zod", version: "4.6.7" },
	]);
});

test("delta computation renders the exact expected table", () => {
	const rows = computeRows(
		collectPins(FIXTURE_MANIFESTS),
		fixtureResolveLatest,
	);
	expect(formatTable(rows)).toBe(
		[
			"| package | pinned | npm latest | delta |",
			"| --- | --- | --- | --- |",
			"| effect-suite | 4.1.4 | 4.2.0 | stale |",
			"| stale-dev | 1.0.0 | 2.0.0 | stale |",
			"| ghost-pkg | 0.9.0 | ⚠ fetch failed | unknown |",
			"| zod | 4.6.7 | 4.6.6 | ahead |",
			"| left-pad | 1.3.0 | 1.3.0 | current |",
		].join("\n"),
	);
});

/**
 * Fixture Cargo.lock, shaped exactly like the generated file (lockfile
 * format v4): a path-only workspace crate, registry pins, a
 * sparse-index-sourced pin, and a git dep.
 */
const FIXTURE_CARGO_LOCK = `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "stellarc-desktop"
version = "0.1.0"
dependencies = [
 "tauri",
]

[[package]]
name = "tao"
version = "0.37.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d5777b06fe6435126ae8d816eba269e050e1e10d302cf5461e9c49eccabc3548"

[[package]]
name = "wry"
version = "0.57.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a490119196d02a51d0871df7b9119a1f3e46d75b7e90053a801454d5c6b3491c"

[[package]]
name = "ghost-crate"
version = "0.9.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0000000000000000000000000000000000000000000000000000000000000000"

[[package]]
name = "serde"
version = "1.0.219"
source = "sparse+https://index.crates.io/"
checksum = "e1425a105e69514f362c188908413bb5fcc0d3cd3dcdbcd6a6dcb5b1a7d7de00"

[[package]]
name = "git-dep"
version = "1.0.0"
source = "git+https://example.com/git-dep?rev=deadbeef#deadbeef"
`;

/**
 * Fixture crates.io API responses, inlined as JSON exactly as the API
 * serves them (`{"crate":{"max_stable_version":…}}`); ghost-crate
 * deliberately absent so its lookup fails the way a network failure would.
 */
const FIXTURE_CRATES_JSON: Record<string, string> = {
	tao: JSON.stringify({
		crate: { max_stable_version: "0.37.2", newest_version: "0.37.2" },
	}),
	wry: JSON.stringify({
		crate: { max_stable_version: "0.57.4", newest_version: "0.57.4" },
	}),
	serde: JSON.stringify({
		crate: { max_stable_version: "1.0.219", newest_version: "1.0.220-rc.1" },
	}),
};

/** The same resolver shape main() builds from the batched fetch cache. */
function fixtureResolveMaxStable(name: string): string | undefined {
	const response = FIXTURE_CRATES_JSON[name];
	if (response === undefined) return undefined;
	return maxStableFromCrateResponse(response);
}

test("pinsFromCargoLock takes registry pins and skips path/git sources", () => {
	expect(pinsFromCargoLock(FIXTURE_CARGO_LOCK)).toEqual([
		{ name: "tao", version: "0.37.2" },
		{ name: "wry", version: "0.57.3" },
		{ name: "ghost-crate", version: "0.9.0" },
		{ name: "serde", version: "1.0.219" },
	]);
});

test("collectCargoPins dedupes across locks and sorts", () => {
	expect(
		collectCargoPins([
			{ path: "desktop/Cargo.lock", text: FIXTURE_CARGO_LOCK },
			{
				path: "apps/other/Cargo.lock",
				text: [
					"[[package]]",
					'name = "wry"',
					'version = "0.57.3"',
					'source = "registry+https://github.com/rust-lang/crates.io-index"',
					"",
				].join("\n"),
			},
		]),
	).toEqual([
		{ name: "ghost-crate", version: "0.9.0" },
		{ name: "serde", version: "1.0.219" },
		{ name: "tao", version: "0.37.2" },
		{ name: "wry", version: "0.57.3" },
	]);
});

test("maxStableFromCrateResponse reads max_stable_version", () => {
	expect(
		maxStableFromCrateResponse(
			JSON.stringify({
				crate: { max_stable_version: "0.57.4", newest_version: "0.58.0-pre.3" },
			}),
		),
	).toBe("0.57.4");
	// flat spelling tolerated
	expect(
		maxStableFromCrateResponse(JSON.stringify({ max_stable_version: "1.0.0" })),
	).toBe("1.0.0");
	// garbage and missing fields degrade to undefined, never throw
	expect(maxStableFromCrateResponse("{max_stable_version:")).toBeUndefined();
	expect(
		maxStableFromCrateResponse(JSON.stringify({ crate: { name: "wry" } })),
	).toBeUndefined();
});

test("cargo half renders the exact expected table (wry blind-spot repro)", () => {
	const rows = computeRows(
		collectCargoPins([
			{ path: "desktop/Cargo.lock", text: FIXTURE_CARGO_LOCK },
		]),
		fixtureResolveMaxStable,
	);
	expect(formatCargoTable(rows)).toBe(
		[
			"| crate | pinned | max_stable | delta |",
			"| --- | --- | --- | --- |",
			"| wry | 0.57.3 | 0.57.4 | stale |",
			"| ghost-crate | 0.9.0 | ⚠ fetch failed | unknown |",
			"| serde | 1.0.219 | 1.0.219 | current |",
			"| tao | 0.37.2 | 0.37.2 | current |",
		].join("\n"),
	);
});

test("cargo summary carries the stats line; no Cargo.lock is a no-op note", () => {
	const rows = computeRows(
		collectCargoPins([
			{ path: "desktop/Cargo.lock", text: FIXTURE_CARGO_LOCK },
		]),
		fixtureResolveMaxStable,
	);
	const section = renderCargoSummary(1, rows);
	expect(section.startsWith("### crates.io pins")).toBeTrue();
	expect(section).toContain("| wry | 0.57.3 | 0.57.4 | stale |");
	expect(section).toContain(
		"4 crates.io pins across 1 Cargo.lock files · 1 stale · 1 unresolved",
	);
	expect(renderCargoSummary(0, [])).toBe(
		["### crates.io pins", "", NO_CARGO_LOCK_NOTE].join("\n"),
	);
});

test("discoverCargoLocks walks the tree and skips build dirs", () => {
	const dir = mkdtempSync(join(tmpdir(), "pins-cargo-"));
	try {
		writeFileSync(join(dir, "Cargo.lock"), FIXTURE_CARGO_LOCK);
		mkdirSync(join(dir, "desktop"), { recursive: true });
		writeFileSync(join(dir, "desktop", "Cargo.lock"), FIXTURE_CARGO_LOCK);
		mkdirSync(join(dir, "target", "debug"), { recursive: true });
		writeFileSync(join(dir, "target", "debug", "Cargo.lock"), "");
		expect(discoverCargoLocks(dir)).toEqual([
			join(dir, "Cargo.lock"),
			join(dir, "desktop", "Cargo.lock"),
		]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
