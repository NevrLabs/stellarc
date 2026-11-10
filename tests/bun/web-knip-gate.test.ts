import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * NEVR-586 — knip dead-code gate on apps/web, day one (Multica #10331
 * pattern: a full-time team still accumulated 2,832 lines of unreferenced
 * frontend code; the fix was making the detector blocking).
 *
 * Part (a) pins the wiring: knip exact-pinned in the root devDependencies,
 * the knip.jsonc config shape (consumer graph, no suppressions), and the
 * blocking `ui-knip` CI job. Part (b) pins the deliverable itself: the
 * trial's 26 findings are all deleted or un-exported, so the scoped pass
 * `bunx knip --workspace apps/web` exits 0 on a clean tree — reintroducing
 * any unused export, unused dependency, or dropping the config makes this
 * red. Part (c) is the catch-behaviour negative control: a seeded unused
 * export must redden the exact finder.
 */

const ROOT = join(import.meta.dir, "..", "..");
const APP = join(ROOT, "apps", "web");
const CONFIG = join(ROOT, "knip.jsonc");
const KNIP_BIN = join(ROOT, "node_modules", ".bin", "knip");
const KNIP_ARGS = ["--workspace", "apps/web"];
const KNIP_VERSION = "6.45.0";

/** knip.jsonc is JSON with comments; strip them without touching strings —
 * a naive regex eats the slash-star runs inside the entry globs. */
function stripJsonc(text: string): string {
	let out = "";
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			out += c;
			if (c === "\\") {
				out += text[i + 1] ?? "";
				i++;
			} else if (c === '"') {
				inString = false;
			}
			continue;
		}
		if (c === '"') {
			inString = true;
			out += c;
		} else if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			out += "\n";
		} else if (c === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
			i++;
		} else {
			out += c;
		}
	}
	return out;
}

function readKnipConfig(): Record<string, unknown> {
	return JSON.parse(stripJsonc(readFileSync(CONFIG, "utf8")));
}

function runKnip() {
	const result = spawnSync(process.execPath, [KNIP_BIN, ...KNIP_ARGS], {
		cwd: ROOT,
		encoding: "utf8",
		timeout: 180_000,
	});
	return {
		status: result.status,
		output: `${result.stdout}\n${result.stderr}`,
	};
}

test("NEVR-586 wiring: exact-pinned knip, root-scoped gate, no per-symbol ignores", () => {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
		devDependencies?: Record<string, string>;
	};
	expect(
		pkg.devDependencies?.knip,
		"knip must stay exact-pinned in the root devDependencies",
	).toBe(KNIP_VERSION);
	expect(existsSync(CONFIG), "knip.jsonc must exist at the repo root").toBe(
		true,
	);

	const cfg = readKnipConfig() as {
		workspaces?: Record<string, Record<string, unknown>>;
	};
	const workspaces = cfg.workspaces ?? {};
	// The root workspace exists only to give tests/bun a consumer graph:
	// its tests import apps/web modules (the NEVR-544 F5 surface), and the
	// scoped pass tracks that cross-workspace usage.
	expect(
		workspaces["."]?.entry,
		"root workspace entry must stay the tests/bun consumer graph",
	).toEqual(["tests/bun/**/*.test.ts"]);
	// apps/web carries no suppression of any kind: the trial's findings were
	// resolved by deletion, never by an ignore list.
	expect(
		workspaces["apps/web"],
		"apps/web workspace section must stay empty (no ignores, no excludes)",
	).toEqual({});
});

test("NEVR-586 baseline: the scoped pass exits 0 on the clean tree", () => {
	const { status, output } = runKnip();
	expect(
		status,
		`knip must exit 0 on apps/web — reintroduced dead code or a dropped config:\n${output}`,
	).toBe(0);
}, 120_000);

test("NEVR-586 catch behaviour: a seeded unused export fails the scoped pass", () => {
	// Seed the probe inside a file that is already part of the analyzed
	// graph (format.ts is imported by components), so it exercises the
	// unused-EXPORTS finder rather than the unused-files one.
	const host = join(APP, "src", "lib", "format.ts");
	const original = readFileSync(host, "utf8");
	writeFileSync(
		host,
		`${original}\nexport function KnipGateProbe(): null {\n	return null;\n}\n`,
	);
	try {
		const { status, output } = runKnip();
		expect(
			status,
			`knip must fail on the seeded unused export:\n${output}`,
		).not.toBe(0);
		expect(output).toContain("Unused exports");
		expect(output).toContain("KnipGateProbe");
	} finally {
		writeFileSync(host, original);
	}
}, 120_000);

test("NEVR-586 CI: ui-knip job is blocking, scoped to apps/web, artifact on failure", () => {
	const wf = parse(
		readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
	) as { jobs?: Record<string, Record<string, unknown>> };
	const jobs = wf.jobs ?? {};
	const job = jobs["ui-knip"];
	expect(job, "ui-knip job exists").toBeDefined();
	expect(
		job?.["continue-on-error"],
		"the job must gate from day one: no continue-on-error",
	).toBeUndefined();
	const steps = (job?.steps ?? []) as Array<{
		run?: string;
		uses?: string;
		with?: Record<string, unknown>;
	}>;
	const pass = steps.find((s) => s.run?.includes("knip"));
	expect(pass?.run, "the pass must run the scoped knip command").toContain(
		"bunx knip --workspace apps/web",
	);
	const artifact = steps.find((s) =>
		String(s.with?.path ?? "").includes("knip.log"),
	);
	expect(artifact, "failure log must be captured as an artifact").toBeDefined();
	// Additive: the existing gate family is untouched.
	expect(jobs.foundation, "foundation job untouched").toBeDefined();
	expect(
		jobs["ui-design-contracts"],
		"ui-design-contracts job untouched",
	).toBeDefined();
	expect(
		jobs["ui-typecheck-budget"],
		"ui-typecheck-budget job untouched",
	).toBeDefined();
});
