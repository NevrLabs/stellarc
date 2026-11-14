import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-551 review defect 1: the deps rotation put @opentelemetry/sdk-logs@3.x
 * and 0.30x exporters outside @effect/opentelemetry's peer ranges, and a later
 * slip pinned @opentelemetry/api to 1.10.0 while every 2.x OTel SDK peer caps
 * at <1.10.0 — neither reached CI because nothing asserted the resolved tree.
 * This gate parses bun.lock (the single source of truth for what installs)
 * and fails the moment any resolved OpenTelemetry identity stops satisfying
 * the peer ranges of the packages that require it.
 */

// Dependency-free semver-satisfies for the range shapes npm peers actually
// use here: exact, ^caret, and >=lower bounds (optionally with <upper).
function parse(v: string): number[] {
	return v.split("-")[0].split(".").map(Number);
}
function cmp(a: number[], b: number[]): number {
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0) ? -1 : 1;
	}
	return 0;
}
function satisfies(version: string, range: string): boolean {
	const v = parse(version);
	if (range.startsWith("^")) {
		const lo = parse(range.slice(1));
		if (cmp(v, lo) < 0) return false;
		return cmp(v, [lo[0] + 1, 0, 0]) < 0;
	}
	for (const m of range.matchAll(/(>=|<|<=)?\s*(\d+\.\d+\.\d+(?:-[\w.]+)?)/g)) {
		const [, op, r] = m;
		const c = cmp(v, parse(r));
		if (op === ">=" && c < 0) return false;
		if (op === "<" && c >= 0) return false;
		if (op === "<=" && c > 0) return false;
		if (!op && c !== 0) return false;
	}
	return true;
}

interface Pkg {
	versions: Set<string>;
	deps: Record<string, string>;
	peers: Record<string, string>;
}

/** Parse bun.lock's packages section: ` "name": ["name@ver", "", {…}, "hash"],` */
function lockPackages(): Map<string, Pkg> {
	const out = new Map<string, Pkg>();
	const lock = readFileSync(join(import.meta.dir, "../../bun.lock"), "utf8");
	for (const m of lock.matchAll(/^ {4}"(.+?)": (\[.*\]),?$/gm)) {
		let entry: unknown[];
		try {
			entry = JSON.parse(m[2]);
		} catch {
			continue;
		}
		const resolved = String(entry[0] ?? "");
		const at = resolved.lastIndexOf("@");
		const name = resolved.slice(0, at);
		const version = resolved.slice(at + 1);
		if (!name || !/^\d/.test(version)) continue;
		const meta = (entry[2] ?? {}) as {
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		let pkg = out.get(name);
		if (!pkg) {
			pkg = { versions: new Set(), deps: {}, peers: {} };
			out.set(name, pkg);
		}
		pkg.versions.add(version);
		Object.assign(pkg.deps, meta.dependencies ?? {});
		Object.assign(pkg.peers, meta.peerDependencies ?? {});
	}
	return out;
}

describe("NEVR-551 OTel peer-range gate", () => {
	const pkgs = lockPackages();
	const otel = [...pkgs.entries()].filter(([n]) =>
		n.startsWith("@opentelemetry/"),
	);

	test("bun.lock parsed a coherent OTel tree", () => {
		expect(otel.length).toBeGreaterThanOrEqual(10);
		for (const [name] of otel) {
			const dep = pkgs.get(name);
			expect(dep, `${name} missing`).toBeDefined();
		}
	});

	test("resolved OTel identities satisfy @effect/opentelemetry's peer ranges", () => {
		const effectOtel = pkgs.get("@effect/opentelemetry");
		if (!effectOtel)
			throw new Error("@effect/opentelemetry missing from bun.lock");
		expect(Object.keys(effectOtel.peers).length).toBeGreaterThan(0);

		const violations: string[] = [];
		for (const [name, range] of Object.entries(effectOtel.peers)) {
			if (!name.startsWith("@opentelemetry/")) continue;
			const dep = pkgs.get(name);
			if (!dep) continue; // optional peer not resolved
			for (const v of dep.versions) {
				if (!satisfies(v, range)) {
					violations.push(
						`${name}@${v} violates @effect/opentelemetry peer ${range}`,
					);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	test("resolved @opentelemetry/api satisfies every OTel package's own api peer", () => {
		const api = pkgs.get("@opentelemetry/api");
		if (!api) throw new Error("@opentelemetry/api missing from bun.lock");
		const violations: string[] = [];
		for (const [name, dep] of otel) {
			const range = dep.peers["@opentelemetry/api"];
			if (!range) continue;
			for (const v of api.versions) {
				if (!satisfies(v, range)) {
					violations.push(
						`${name} needs @opentelemetry/api ${range}, resolved ${v}`,
					);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	test("root manifest requests each OTel package at the resolved identity only", () => {
		const root = JSON.parse(
			readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
		);
		const requested: Record<string, string> = {
			...root.dependencies,
			...root.devDependencies,
		};
		const violations: string[] = [];
		for (const [name, spec] of Object.entries(requested)) {
			if (!name.startsWith("@opentelemetry/")) continue;
			if (spec.startsWith("workspace:") || spec.startsWith("patch:")) continue;
			const dep = pkgs.get(name);
			if (!dep || dep.versions.size === 0) {
				violations.push(`${name}=${spec} requested but not resolved`);
				continue;
			}
			if (![...dep.versions].includes(spec.replace(/^[~^]/, ""))) {
				violations.push(
					`${name}: manifest ${spec} not among resolved ${[...dep.versions]}`,
				);
			}
		}
		// No OTel package may resolve to more than one identity at the root line.
		for (const [name, dep] of otel) {
			if (name === "@opentelemetry/api") continue; // override-forced single
			if (dep.versions.size > 1) {
				violations.push(
					`${name} has multiple identities: ${[...dep.versions]}`,
				);
			}
		}
		expect(violations).toEqual([]);
	});
});
