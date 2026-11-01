import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-172 dependency-currency gate. The UI deps were moved off stale majors
 * (framer-motion 12 → motion 14 rename, lucide-react 0.x → 1, react-day-picker
 * 9 exact-pin → ^10, mermaid exact-pin → caret, @base-ui/react floor 1.9).
 * These invariants are load-bearing: a silent `^` resolution back across a
 * major (or a reverted rename) is exactly the drift this pass removed, and
 * none of it is caught by typecheck alone.
 */

const uiDir = join(import.meta.dir, "../../apps/stellarc-ui");
const pkg = JSON.parse(readFileSync(join(uiDir, "package.json"), "utf8"));
const deps = pkg.dependencies as Record<string, string>;

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

test("UI dependency floors hold at the NEVR-172 majors", () => {
	expect(deps["motion"] ?? "").toMatch(/^\^14\./);
	expect(deps["framer-motion"]).toBeUndefined();
	expect(deps["lucide-react"] ?? "").toMatch(/^\^1\./);
	expect(deps["react-day-picker"] ?? "").toMatch(/^\^10\./);
	expect(deps["mermaid"] ?? "").toMatch(/^\^?\d+\.\d+\.\d+$/); // caret or plain — never an exact pin
	expect(deps["mermaid"] ?? "").not.toMatch(/^11\./);
	expect(deps["@base-ui/react"] ?? "").toMatch(/^\^1\.(9|\d{2,})\./);
});

test("no framer-motion imports remain in the UI source", () => {
	const offenders = walk(join(uiDir, "src"))
		.filter((f) => readFileSync(f, "utf8").includes("framer-motion"))
		.map((f) => f.slice(uiDir.length + 1));
	expect(offenders).toEqual([]);
});

test("lucide brand icons stay local (lucide-react 1.x dropped them)", () => {
	const brand =
		/\b(Github|Slack|Gitlab|Twitter|Figma|Trello|Dribbble|Codesandbox)\b/;
	const offenders = walk(join(uiDir, "src"))
		.filter((f) => {
			const text = readFileSync(f, "utf8");
			// only named imports from lucide-react (or its subpaths), not comments
			const imports = [
				...text.matchAll(
					/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"lucide-react[/"]/g,
				),
			];
			return imports.some((m) => brand.test(m[1]));
		})
		.map((f) => f.slice(uiDir.length + 1));
	expect(offenders).toEqual([]);
});
