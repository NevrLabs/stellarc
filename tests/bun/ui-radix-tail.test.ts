import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-171 Radix→Base tail gate. The migration is complete: no radix imports
 * in UI source, no radix entries in the UI manifest, and components.json
 * fetches the Base dialect with no third-party registries. These invariants
 * are load-bearing: a stray `shadcn add` from the old new-york (Radix)
 * dialect or a re-added @coss (AGPL upstream, ADR 0008) registry entry is
 * exactly the drift this cleanup removed, and none of it is caught by
 * typecheck alone.
 */

const uiDir = join(import.meta.dir, "../../apps/stellarc-ui");
const pkg = JSON.parse(readFileSync(join(uiDir, "package.json"), "utf8")) as {
	dependencies: Record<string, string>;
	devDependencies?: Record<string, string>;
};
const components = JSON.parse(
	readFileSync(join(uiDir, "components.json"), "utf8"),
) as { style?: string; registries?: Record<string, string> };

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === "node_modules" || entry === "dist") continue;
			walk(full, out);
		} else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

test("UI manifest carries zero radix entries", () => {
	const radixEntries = Object.keys(pkg.dependencies)
		.concat(Object.keys(pkg.devDependencies ?? {}))
		.filter((name) => name === "radix-ui" || name.startsWith("@radix-ui/"));
	expect(radixEntries).toEqual([]);
});

test("no radix imports remain anywhere in UI source", () => {
	const offenders = walk(join(uiDir, "src"))
		.filter((f) => /radix-ui/.test(readFileSync(f, "utf8")))
		.map((f) => f.slice(uiDir.length + 1));
	expect(offenders).toEqual([]);
});

test("components.json speaks the Base dialect with no third-party registries", () => {
	expect(components.style).toMatch(/^base-/);
	expect(components.registries).toBeUndefined();
	// @coss is AGPL-3.0 upstream; ADR 0008 rules it inspiration-only.
	const serialized = JSON.stringify(components);
	expect(serialized).not.toContain("coss");
});

test("cn package replaced clsx + tailwind-merge as the class-merge engine", () => {
	expect(pkg.dependencies.clsx).toBeUndefined();
	expect(pkg.dependencies["tailwind-merge"]).toBeUndefined();
	expect(pkg.dependencies.cn).toMatch(/^\^?0\./);
});
