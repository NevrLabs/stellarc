import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-223 acceptance gate: the ported shadcn AI elements must be free of
 * the registry's docs-app imports. The live base-nova payloads ship
 * `@/app/(create)/components/icon-placeholder` (and `@/registry/...` paths);
 * the port swaps them for lucide icons and our own aliases. This pins that
 * no re-sync reintroduces them.
 */

const UI_ROOT = join(import.meta.dir, "../../apps/stellarc-ui/src");

const PORTED = new Set([
	"trace.tsx",
	"code-block.tsx",
	"item.tsx",
	"tool.tsx",
	"subagent.tsx",
	"test-results.tsx",
	"confirmation.tsx",
	"chain-of-thought.tsx",
]);

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			yield* walk(full);
		} else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
			yield full;
		}
	}
}

test("ported AI elements contain no docs-app or registry-internal imports", () => {
	const offenders: string[] = [];
	for (const file of walk(UI_ROOT)) {
		const base = file.split("/").pop() as string;
		const isPorted = PORTED.has(base);
		const isAdapter = file.includes("agent-transcript");
		if (!isPorted && !isAdapter) continue;
		const src = readFileSync(file, "utf8");
		for (const line of src.split("\n")) {
			if (
				line.includes("@/app/") ||
				line.includes("@/registry/") ||
				line.includes("icon-placeholder") ||
				line.includes("@shadcn/react")
			) {
				offenders.push(`${file}: ${line.trim()}`);
			}
		}
	}
	expect(offenders).toEqual([]);
});

test("ported AI elements exist in the ui directory", () => {
	const uiDir = join(UI_ROOT, "components/ui");
	const present = new Set(readdirSync(uiDir));
	for (const name of PORTED) {
		expect(present.has(name), `${name} missing from components/ui`).toBe(true);
	}
});
