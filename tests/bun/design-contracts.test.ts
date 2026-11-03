import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-455 — design-system contracts on apps/web from day one.
 *
 * Part (a) pins the wiring and the catch behaviour of the blocking
 * `ui-design-contracts` pass (@shadcn/lint 0.2.5 under Oxlint, scoped to
 * apps/web). apps/web is greenfield (ADR 0014): there is NO recorded budget —
 * the tree must pass clean, and any net-new violation is red. Deleting the
 * rules, the config, the script, the devDependencies, or the CI job — or
 * reintroducing a budget — makes these tests red.
 */

const ROOT = join(import.meta.dir, "..", "..");
const APP = join(ROOT, "apps", "web");
const CONFIG = join(APP, ".oxlintrc.json");
const RULES = [
	"no-restyle",
	"no-raw-colors",
	"no-arbitrary-values",
	"no-inline-styles",
	"no-unknown-classes",
	"require-static-classes",
] as const;
const ONSYSTEM_PIN =
	"dgesteves/onsystem@8f84b7aad1bcf6caa12012e6beb35e87eb55d85a"; // v0.12.1

function readJson(path: string) {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/**
 * The body of one top-level workflow job: from its own key line (anchored at
 * exactly two spaces of indent, so a textual mention in a comment cannot
 * match) up to the next two-space-indented key, exclusive — never a fixed
 * character window, so it cannot bleed into a following job.
 */
function jobBody(workflow: string, job: string): string {
	const start = workflow.match(new RegExp(`^  ${job}:[ \\t]*$`, "m"));
	if (!start || start.index === undefined) return "";
	const rest = workflow.slice(start.index);
	const next = rest
		.slice(rest.indexOf("\n") + 1)
		.match(/^ {2}\S[^\n]*:[ \t]*$/m);
	if (!next || next.index === undefined) return rest;
	return rest.slice(0, rest.indexOf("\n") + 1 + next.index);
}

/** YAML comment lines must never satisfy a wiring assertion (NEVR-333). */
function stripComments(yaml: string): string {
	return yaml
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("#"))
		.join("\n");
}

test("NEVR-455 wiring: exact-pin devDependencies, dedicated script, Biome untouched", () => {
	const pkg = readJson(join(APP, "package.json")) as {
		scripts?: Record<string, string>;
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	expect(
		pkg.devDependencies?.["@shadcn/lint"],
		"@shadcn/lint devDependency must stay exact-pinned at 0.2.5",
	).toBe("0.2.5");
	expect(
		pkg.devDependencies?.oxlint,
		"oxlint runner devDependency",
	).toBeDefined();
	expect(
		pkg.scripts?.["lint:design"],
		"dedicated design-contract pass script",
	).toBe("oxlint --config .oxlintrc.json --quiet src");
	// No new runtime dependencies: the lint tooling is dev-only.
	expect(
		pkg.dependencies?.["@shadcn/lint"] ?? pkg.dependencies?.oxlint,
		"lint tooling must not leak into dependencies",
	).toBeUndefined();
	// Biome stays the repo linter; this pass is additive.
	const root = readJson(join(ROOT, "package.json")) as {
		scripts?: Record<string, string>;
	};
	expect(root.scripts?.lint).toBe("biome check .");
});

test("NEVR-455 contracts: six rules at error severity, ui dir may style itself, no budget", () => {
	expect(existsSync(CONFIG), ".oxlintrc.json missing").toBe(true);
	const cfg = readJson(CONFIG) as {
		rules?: Record<string, unknown>;
		overrides?: Array<{ files?: string[]; rules?: Record<string, string> }>;
	};
	for (const rule of RULES) {
		const setting = cfg.rules?.[`shadcn/${rule}`] as
			| [string, ...unknown[]]
			| string
			| undefined;
		const severity = Array.isArray(setting) ? setting[0] : setting;
		expect(severity, `shadcn/${rule} must be an error`).toBe("error");
	}
	// Owned components style themselves; that exemption must stay scoped to
	// exactly their directory and never leak to consumers.
	const uiOverride = cfg.overrides?.find((o) =>
		o.files?.includes("src/components/ui/**"),
	);
	expect(uiOverride, "component-directory override").toBeDefined();
	expect(uiOverride?.rules?.["shadcn/no-restyle"]).toBe("off");
	expect(uiOverride?.rules?.["shadcn/no-arbitrary-values"]).toBe("off");
	expect(cfg.overrides?.length).toBe(1);
	// Day-one blocking posture: no recorded debt budget may exist — the tree
	// itself is the baseline, and any violation fails the pass.
	expect(
		existsSync(join(APP, "design-contract-budget.json")),
		"budget file reintroduces the trial's non-blocking posture",
	).toBe(false);
});

test("NEVR-455 CI: ui-design-contracts job is blocking and scoped to apps/web", () => {
	const workflow = stripComments(
		readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
	);
	const job = jobBody(workflow, "ui-design-contracts");
	expect(job, "ui-design-contracts job exists").not.toBe("");
	expect(
		job,
		"the job must gate: no continue-on-error anywhere in its body",
	).not.toMatch(/^ {4}continue-on-error:/m);
	expect(job, "the pass must run through the dedicated script").toContain(
		"bun run --cwd apps/web lint:design",
	);
	expect(
		job,
		"Tailwind-worker timeout knob must be set for cold CI machines",
	).toMatch(/^ {6}SHADCN_LINT_TAILWIND_TIMEOUT:/m);
	expect(job, "failure log must be captured as an artifact").toContain(
		"design-contract.log",
	);
});

test("NEVR-455 CI: onsystem diff job non-blocking, SHA-pinned, diff-gated to apps/web", () => {
	const workflow = stripComments(
		readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
	);
	const job = jobBody(workflow, "onsystem-diff");
	expect(job, "onsystem-diff job exists").not.toBe("");
	expect(job, "the job must stay non-blocking").toMatch(
		/^ {4}continue-on-error:[ \t]*true$/m,
	);
	expect(
		job,
		"the action must stay pinned to the v0.12.1 release commit",
	).toMatch(
		new RegExp(
			`^ {8}uses: ${ONSYSTEM_PIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} # v0\\.12\\.1$`,
			"m",
		),
	);
	expect(job, "scoped to apps/web").toMatch(
		/^ {10}working-directory: apps\/web$/m,
	);
	// The action diffs against event.pull_request.base.sha itself; the job
	// must hand it a full checkout to do so (and feed the path gate).
	expect(job, "full checkout for the diff").toMatch(/^ {10}fetch-depth: 0$/m);
	expect(job, "report warnings while non-blocking").toMatch(
		/^ {10}fail-on: warning$/m,
	);
	// Diff-scoped: only PRs touching apps/web/src/components/** run it, and
	// only pull requests (pushes have no PR diff to scope to).
	expect(job, "PR-only posture").toContain(
		"github.event_name == 'pull_request'",
	);
	expect(job, "components diff gate").toContain("apps/web/src/components/");
	// The trial is additive: no existing job removed, no gate touched.
	expect(workflow).toContain("foundation:");
	expect(workflow).toContain("ui-typecheck-budget:");
});

test("NEVR-455 catch behaviour: a seeded violation fails the pass with agent-readable remediation", () => {
	const probe = join(APP, "src", "design-contract-probe.test-fixture.tsx");
	writeFileSync(
		probe,
		[
			'import { Button } from "@/components/ui/button";',
			"",
			"export function DesignContractProbe() {",
			"\treturn (",
			'\t\t<div className="bg-pink-500">',
			'\t\t\t<Button className="p-4">seeded violation</Button>',
			"\t\t</div>",
			"\t);",
			"}",
			"",
		].join("\n"),
	);
	try {
		// Strip GITHUB_ACTIONS so oxlint uses its default output format here
		// even when the test itself runs inside a CI runner.
		const env = { ...process.env };
		delete env.GITHUB_ACTIONS;
		env.SHADCN_LINT_TAILWIND_TIMEOUT = "120000";
		const result = spawnSync(
			process.execPath,
			[
				join(APP, "node_modules", ".bin", "oxlint"),
				"--config",
				".oxlintrc.json",
				"--quiet",
				"src/design-contract-probe.test-fixture.tsx",
			],
			{ cwd: APP, encoding: "utf8", env, timeout: 180_000 },
		);
		const output = `${result.stdout}\n${result.stderr}`;
		expect(
			result.status,
			`oxlint must fail on the seeded file:\n${output}`,
		).not.toBe(0);
		expect(output).toContain("shadcn(no-restyle)");
		expect(output).toContain('"p-4" is not allowed on <Button>');
		expect(output).toContain("Use a size (");
		expect(output).toContain("shadcn(no-raw-colors)");
		expect(output).toContain("bg-pink-500");
	} finally {
		rmSync(probe, { force: true });
	}
});
