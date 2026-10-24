import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-315 — @shadcn/lint design-contract trial on apps/stellarc-ui.
 *
 * These tests pin the WIRING and the catch behaviour of the trial, not the
 * existing tree's cleanliness: the recorded debt in
 * apps/stellarc-ui/design-contract-budget.json is compared only by the
 * informational (continue-on-error) `ui-design-contracts` CI job, never here,
 * so the trial stays non-gating by construction. Deleting the rules, the
 * config, the script, or the CI job makes these tests red.
 */

const ROOT = join(import.meta.dir, "..", "..");
const APP = join(ROOT, "apps", "stellarc-ui");
const CONFIG = join(APP, ".oxlintrc.json");
const RULES = ["no-restyle", "no-raw-colors", "no-arbitrary-values"] as const;

function readJson(path: string) {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test("NEVR-315 wiring: devDependency, dedicated script, and existing lint untouched", () => {
	const pkg = readJson(join(APP, "package.json")) as {
		scripts?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	expect(
		pkg.devDependencies?.["@shadcn/lint"],
		"@shadcn/lint devDependency",
	).toBe("0.2.3");
	expect(
		pkg.devDependencies?.oxlint,
		"oxlint runner devDependency",
	).toBeDefined();
	expect(
		pkg.scripts?.["lint:design"],
		"dedicated design-contract pass script",
	).toBe("oxlint --config .oxlintrc.json --quiet src");
	// The trial is additive: Biome stays the app's only lint gate.
	expect(pkg.scripts?.lint).toBe("biome check --write .");
});

test("NEVR-315 starter contracts: three rules at error severity, ui dir may style itself", () => {
	const cfg = readJson(CONFIG) as {
		rules?: Record<string, unknown>;
		overrides?: Array<{ files?: string[]; rules?: Record<string, string> }>;
	};
	for (const rule of RULES) {
		const setting = cfg.rules?.[`shadcn/${rule}`] as [string] | undefined;
		expect(setting?.[0], `shadcn/${rule} must be an error`).toBe("error");
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
	// The recorded debt budget exists and names the same rules.
	const budget = readJson(join(APP, "design-contract-budget.json")) as {
		by_rule?: Record<string, number>;
	};
	for (const rule of RULES) {
		expect(budget.by_rule?.[rule], `budget entry for ${rule}`).toBeDefined();
	}
});

test("NEVR-315 CI: informational non-gating job mirrors the ui-typecheck-budget posture", () => {
	const workflow = readFileSync(
		join(ROOT, ".github", "workflows", "ci.yml"),
		"utf8",
	);
	const job =
		workflow.split("ui-design-contracts:", 2)[1]?.slice(0, 3000) ?? "";
	expect(job, "ui-design-contracts job exists").toContain(
		"continue-on-error: true",
	);
	expect(job).toContain("lint:design");
	expect(job).toContain("design-contract-budget.json");
	// The gating jobs must be untouched: no new gate was added anywhere.
	expect(workflow).toContain("ui-typecheck-budget:");
});

test("NEVR-315 catch behaviour: a seeded violation is reported with agent-readable remediation", () => {
	expect(existsSync(CONFIG), ".oxlintrc.json missing").toBe(true);
	const probe = join(APP, "src", "design-contract-probe.test-fixture.tsx");
	writeFileSync(
		probe,
		[
			'import { Button } from "@/components/ui/button";',
			"",
			"export function DesignContractProbe() {",
			"\treturn (",
			'\t\t<div className="bg-pink-500 p-[13px]">',
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
		const result = spawnSync(
			process.execPath,
			[
				join(APP, "node_modules", ".bin", "oxlint"),
				"--config",
				".oxlintrc.json",
				"--quiet",
				"src/design-contract-probe.test-fixture.tsx",
			],
			{ cwd: APP, encoding: "utf8", env },
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
		expect(output).toContain("src/index.css");
		expect(output).toContain("shadcn(no-arbitrary-values)");
		expect(output).toContain('"p-3.25" instead');
	} finally {
		rmSync(probe, { force: true });
	}
});
