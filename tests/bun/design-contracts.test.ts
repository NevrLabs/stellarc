import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

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

type WorkflowJob = {
	"continue-on-error"?: boolean;
	if?: string;
	env?: Record<string, unknown>;
	steps?: Array<{
		run?: string;
		uses?: string;
		if?: string;
		with?: Record<string, unknown>;
		env?: Record<string, unknown>;
	}>;
};

function workflowJobs(): Record<string, WorkflowJob> {
	const wf = parse(
		readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
	) as { jobs?: Record<string, WorkflowJob> };
	return wf.jobs ?? {};
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
	const job = workflowJobs()["ui-design-contracts"];
	expect(job, "ui-design-contracts job exists").toBeDefined();
	expect(
		job?.["continue-on-error"],
		"the job must gate: no continue-on-error anywhere",
	).toBeUndefined();
	const steps = job?.steps ?? [];
	const pass = steps.find((s) => s.run?.includes("lint:design"));
	expect(pass, "the pass must run through the dedicated script").toBeDefined();
	expect(pass?.run).toContain("bun run --cwd apps/web lint:design");
	expect(
		job?.env?.SHADCN_LINT_TAILWIND_TIMEOUT,
		"Tailwind-worker timeout knob must be set for cold CI machines",
	).toBe("120000");
	const artifact = steps.find((s) =>
		String(s.with?.path ?? "").includes("design-contract.log"),
	);
	expect(artifact, "failure log must be captured as an artifact").toBeDefined();
});

test("NEVR-455 CI: onsystem diff job non-blocking, SHA-pinned, diff-gated to apps/web", () => {
	const jobs = workflowJobs();
	const job = jobs["onsystem-diff"];
	expect(job, "onsystem-diff job exists").toBeDefined();
	expect(job?.["continue-on-error"], "the job must stay non-blocking").toBe(
		true,
	);
	const steps = job?.steps ?? [];
	const action = steps.find((s) => s.uses?.startsWith("dgesteves/onsystem@"));
	expect(
		action?.uses,
		"the action must stay pinned to the v0.12.1 release commit",
	).toBe(ONSYSTEM_PIN);
	expect(action?.with?.["working-directory"], "scoped to apps/web").toBe(
		"apps/web",
	);
	expect(action?.with?.["fail-on"], "report warnings while non-blocking").toBe(
		"warning",
	);
	const checkout = steps.find((s) => s.uses?.startsWith("actions/checkout"));
	// The action diffs against event.pull_request.base.sha itself; the job
	// must hand it a full checkout to do so (and feed the path gate).
	expect(checkout?.with?.["fetch-depth"], "full checkout for the diff").toBe(0);
	// Diff-scoped: only PRs touching apps/web/src/components/** run it, and
	// only pull requests (pushes have no PR diff to scope to).
	expect(job?.if).toContain("github.event_name == 'pull_request'");
	const gate = steps.find((s) => s.run?.includes("apps/web/src/components/"));
	expect(
		gate,
		"a git-diff gate step scopes the check to components",
	).toBeDefined();
	expect(action?.if, "the diff gate must actually control the action").toBe(
		"steps.diff.outputs.components == 'true'",
	);
	// The trial is additive: no existing job removed, no gate touched.
	expect(jobs.foundation, "foundation job untouched").toBeDefined();
	expect(
		jobs["ui-typecheck-budget"],
		"ui-typecheck-budget job untouched",
	).toBeDefined();
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

/**
 * NEVR-475 — the three recorded exceptions are gone, and they stay gone.
 *
 * The NEVR-455 pass shipped with three allowlist entries recorded as drift:
 * six shell-vocab classes (no-unknown-classes), the Menu org/avatar contract
 * (no-restyle), and px-[5px] (no-arbitrary-values). NEVR-475 reconciled the
 * drift itself, so an empty allowlist must now be the steady state — any new
 * entry is a recorded decision and belongs in a deliberate config change,
 * never a convenience pass. These tests are red against the pre-NEVR-475
 * config.
 */
test("NEVR-475: design-lint exceptions are zero — all three allowlists empty, severity untouched", () => {
	const cfg = readJson(CONFIG) as {
		rules?: Record<string, unknown>;
	};
	const optionsOf = (rule: string): Record<string, unknown> => {
		const setting = cfg.rules?.[`shadcn/${rule}`] as
			| [string, Record<string, unknown>?]
			| undefined;
		expect(setting, `shadcn/${rule} must keep its config entry`).toBeDefined();
		expect(setting?.[0], `shadcn/${rule} must stay an error`).toBe("error");
		return setting?.[1] ?? {};
	};
	expect(
		optionsOf("no-unknown-classes").allow ?? [],
		"no-unknown-classes allowlist must be empty",
	).toEqual([]);
	expect(
		optionsOf("no-arbitrary-values").allow ?? [],
		"no-arbitrary-values allowlist must be empty",
	).toEqual([]);
	const restyle = optionsOf("no-restyle");
	expect(
		restyle.contracts ?? [],
		"no-restyle contracts must be empty — chrome belongs to owned variants",
	).toEqual([]);
	// The rule-level layout allowance is policy, not a recorded exception;
	// it must survive the shrink unchanged.
	expect(restyle.allow).toEqual(["layout"]);
});

/**
 * NEVR-475 drift check: the shell vocabulary NEVR-475 took ownership of is
 * ported into app.css 1:1 with docs/design/shell/shell.css — same selectors,
 * same declarations, modulo the port's token renames. If either side edits
 * one of these rules without the other, this is red.
 */
test("NEVR-475: ported shell vocabulary stays 1:1 with docs/design/shell/shell.css", () => {
	const shell = readFileSync(
		join(ROOT, "docs", "design", "shell", "shell.css"),
		"utf8",
	);
	const app = readFileSync(join(APP, "src", "styles", "app.css"), "utf8");
	// The port renames the design's --mono to Tailwind's --font-mono; these
	// selectors use no other renamed tokens.
	const normalize = (value: string) =>
		value
			.replace(/var\(--mono\)/g, "var(--font-mono)")
			.replace(/\s+/g, " ")
			.trim();
	const declarationsOf = (css: string, selector: string): string[] => {
		const body = css
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.match(
				new RegExp(
					`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
				),
			)?.[1];
		expect(body, `${selector} must exist in this css`).toBeDefined();
		return (body ?? "")
			.split(";")
			.map((d) => normalize(d))
			.filter(Boolean)
			.sort();
	};
	for (const selector of [".tl-bar.cut", ".mini", ".mini.bot", ".search .k"]) {
		expect(
			declarationsOf(app, selector),
			`${selector} must be ported 1:1 from shell.css`,
		).toEqual(declarationsOf(shell, selector));
	}
});

/**
 * NEVR-475 negative control: with the allowlists empty, the exact surfaces
 * that used to be exempted — an unknown shell-vocab class, a raw arbitrary
 * value, a chrome class passed to an owned component — redden their exact
 * rule. Red against the pre-NEVR-475 config for the opposite reason: there,
 * "mc" and the Menu contract were exempted, so those rules never fired.
 */
test("NEVR-475 catch behaviour: un-exempted surfaces redden their exact rule", () => {
	const probe = join(APP, "src", "design-contract-probe.test-fixture.tsx");
	writeFileSync(
		probe,
		[
			'import { Button } from "@/components/ui/button";',
			"",
			"export function DesignContractProbe() {",
			"\treturn (",
			'\t\t<div className="mc px-[7px]">',
			'\t\t\t<Button className="org">seeded violation</Button>',
			"\t\t</div>",
			"\t);",
			"}",
			"",
		].join("\n"),
	);
	try {
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
		expect(output).toContain("shadcn(no-unknown-classes)");
		expect(output).toContain('"mc"');
		expect(output).toContain("shadcn(no-arbitrary-values)");
		expect(output).toContain("px-[7px]");
		expect(output).toContain("shadcn(no-restyle)");
		expect(output).toContain('"org" is not allowed on <Button>');
	} finally {
		rmSync(probe, { force: true });
	}
});
