/**
 * NEVR-724 — unit test for the pins-current delta computation.
 *
 * Pure-function coverage over scripts/pins-current.ts: fixture package.json
 * set + fixture registry responses inlined as JSON (no network) → exact
 * expected delta table. Required rows per the brief: one pinned==latest
 * (current), one pinned<latest (stale), one workspace:* spec (ignored);
 * plus the specified degradations — range specs ignored, and a failed
 * registry lookup becoming a warning row instead of an error.
 */

import { expect, test } from "bun:test";
import {
	collectPins,
	compareSemver,
	computeRows,
	formatTable,
	isExactPin,
	latestFromPackument,
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
