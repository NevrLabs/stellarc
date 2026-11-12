import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * NEVR-620 — @google/design.md spec gate on the root DESIGN.md, day one.
 *
 * Part (a) pins the wiring: the blocking `design-doc-lint` CI job, the
 * exact 0.4.0 pin (the spec is `version: alpha` and its schema moves), the
 * failure artifact, and the diff-on-change note in DESIGN.md's own prose.
 * Part (b) is the baseline: the NEVR-620 cleanup drove orphaned-tokens to
 * zero, so the gate verdict is green on the clean tree. Part (c) is the
 * negative control: a color token seeded into a scratch copy of DESIGN.md
 * must redden the exact orphaned-tokens rule and turn the gate verdict
 * nonzero, and reverting to the real file must go green again.
 *
 * The gate verdict mirrors the python check in the CI job: the 0.4.0 CLI
 * exits nonzero only on errors — warnings stay exit 0 — so the verdict
 * re-reads the JSON summary and fails on any warning too.
 */

const ROOT = join(import.meta.dir, "..", "..");
const DESIGN = join(ROOT, "DESIGN.md");
const PIN = "@google/design.md@0.4.0";

type Summary = { errors?: number; warnings?: number };

type LintRun = {
	status: number | null;
	output: string;
	summary?: Summary;
	findings?: Array<{
		severity: string;
		path?: string;
		rule: string;
		message: string;
	}>;
};

function runLint(file: string): LintRun {
	const result = spawnSync(process.execPath, ["x", PIN, "lint", file], {
		cwd: ROOT,
		encoding: "utf8",
		timeout: 180_000,
	});
	let report:
		| {
				summary?: Summary;
				findings?: LintRun["findings"];
		  }
		| undefined;
	try {
		report = JSON.parse(result.stdout);
	} catch {
		report = undefined;
	}
	return {
		status: result.status,
		output: `${result.stdout}\n${result.stderr}`,
		summary: report?.summary,
		findings: report?.findings,
	};
}

/** The CI gate verdict: nonzero on a CLI failure, a missing report, or any
 * error/warning in the summary — the exact semantics of the python check
 * inside the design-doc-lint job. */
function gateVerdict(run: LintRun): number {
	if (run.status !== 0 || !run.summary) return 1;
	return run.summary.errors === 0 && run.summary.warnings === 0 ? 0 : 1;
}

test("NEVR-620 wiring: blocking design-doc-lint job, exact pin, artifact, prose note", () => {
	const wf = parse(
		readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
	) as { jobs?: Record<string, Record<string, unknown>> };
	const jobs = wf.jobs ?? {};
	const job = jobs["design-doc-lint"];
	expect(job, "design-doc-lint job exists").toBeDefined();
	expect(
		job?.["continue-on-error"],
		"the job must gate from day one: no continue-on-error",
	).toBeUndefined();
	const steps = (job?.steps ?? []) as Array<{
		run?: string;
		uses?: string;
		with?: Record<string, unknown>;
	}>;
	const pass = steps.find((s) => s.run?.includes("lint DESIGN.md"));
	expect(pass?.run, "the pass must run the pinned lint on DESIGN.md").toContain(
		`bunx ${PIN} lint DESIGN.md`,
	);
	expect(
		pass?.run,
		"the CLI exits 0 on warnings, so the step must fail on the JSON summary's warning count itself",
	).toContain("warnings");
	const artifact = steps.find((s) =>
		String(s.with?.path ?? "").includes("design-doc-lint.log"),
	);
	expect(artifact, "failure log must be captured as an artifact").toBeDefined();
	// The pin is exact, not a range and not latest: the spec is version
	// alpha, its schema moves, and 0.4.0 behavior is what these tests
	// encode. A bump is a deliberate fold that updates this file too.
	expect(pass?.run?.includes(`${PIN} `), "exact 0.4.0 pin").toBe(true);
	expect(pass?.run?.includes("latest"), "never ride latest").toBe(false);
	// Additive: the existing gate family is untouched.
	for (const name of [
		"foundation",
		"ui-knip",
		"ui-design-contracts",
		"scope-audit",
	]) {
		expect(jobs[name], `${name} job untouched`).toBeDefined();
	}

	// The diff-on-change law lives in DESIGN.md's own prose (there is no PR
	// template to carry it — creating one is a recorded non-goal).
	const doc = readFileSync(DESIGN, "utf8");
	const components = doc.slice(
		doc.indexOf("## Components"),
		doc.indexOf("## Do's and Don'ts"),
	);
	expect(
		doc.includes("### Changes to this file"),
		"DESIGN.md must carry the diff-on-change note",
	).toBe(true);
	expect(components, "the note lives at the end of ## Components").toContain(
		`${PIN} diff`,
	);
});

test("NEVR-620 baseline: the gate verdict is green on the clean tree", () => {
	const run = runLint(DESIGN);
	expect(
		run.summary,
		`lint must emit its JSON report:\n${run.output}`,
	).toBeDefined();
	expect(
		gateVerdict(run),
		`DESIGN.md must lint 0 errors / 0 warnings (orphaned tokens, contrast, sub-token drift all gate):\n${run.output}`,
	).toBe(0);
}, 240_000);

test("NEVR-620 catch behaviour: a seeded orphan token reddens the gate, revert goes green", () => {
	const original = readFileSync(DESIGN, "utf8");
	const scratch = join(mkdtempSync(join(tmpdir(), "nevr-620-")), "DESIGN.md");
	try {
		// Seed an orphan: a colors token no component references.
		const seeded = original.replace(
			'  primary: "#9BA2FF"\n',
			'  primary: "#9BA2FF"\n  probe-orphan-gate: "#0F0F10"\n',
		);
		expect(seeded, "seeding anchor must exist in DESIGN.md").not.toBe(original);
		writeFileSync(scratch, seeded);

		const red = runLint(scratch);
		const orphan = red.findings?.find(
			(f) => f.path === "colors.probe-orphan-gate",
		);
		expect(
			orphan?.rule,
			`the seeded token must redden the exact orphaned-tokens rule:\n${red.output}`,
		).toBe("orphaned-tokens");
		expect(
			gateVerdict(red),
			"the gate verdict must be nonzero with the orphan seeded",
		).toBe(1);
	} finally {
		rmSync(join(scratch, ".."), { force: true, recursive: true });
	}

	// Revert: the real, unseeded DESIGN.md goes green again.
	const green = runLint(DESIGN);
	expect(gateVerdict(green), "revert must restore the green verdict").toBe(0);
}, 480_000);
