import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NEVR-332 — onsystem diff-scoped design-system trial on apps/stellarc-ui.
 *
 * Pins the WIRING of the informational CI job only. What onsystem finds on a
 * real diff is recorded on the Multica issue from the trial PRs' check runs
 * (seed-pair evidence: red on the seeded diff, quiet on the clean one), never
 * asserted here, so the trial stays non-gating by construction. Deleting the
 * job, flipping it to a gate, unpinning the action, or commenting any of the
 * pinned wiring out makes this test red: assertions run on the job body with
 * comment lines stripped (NEVR-333 rework).
 */

const ROOT = join(import.meta.dir, "..", "..");
const PIN = "dgesteves/onsystem@5d4edfdf2577eb8e5971287d28d05f8bbdf61048"; // v0.10.0

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

/** YAML comment lines must never satisfy a wiring assertion (NEVR-333 defect 1). */
function stripComments(yaml: string): string {
	return yaml
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("#"))
		.join("\n");
}

test("NEVR-332 CI: onsystem diff job exists, non-blocking, pinned, scoped to the UI app", () => {
	const workflow = readFileSync(
		join(ROOT, ".github", "workflows", "ci.yml"),
		"utf8",
	);
	const job = stripComments(jobBody(workflow, "onsystem-diff"));
	expect(job, "onsystem-diff job exists").not.toBe("");
	expect(job, "the job must stay non-blocking").toMatch(
		/^ {4}continue-on-error:[ \t]*true$/m,
	);
	expect(
		job,
		"the action must stay pinned to the v0.10.0 release commit",
	).toMatch(
		new RegExp(
			`^ {8}uses: ${PIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} # v0\\.10\\.0$`,
			"m",
		),
	);
	expect(job, "scoped to the UI app").toMatch(
		/^ {10}working-directory: apps\/stellarc-ui$/m,
	);
	// The action diffs against event.pull_request.base.sha itself; the job
	// must hand it a full checkout to do so.
	expect(job, "full checkout for the diff").toMatch(/^ {10}fetch-depth: 0$/m);
	// The trial is additive: no existing job removed, no new gate anywhere.
	expect(workflow).toContain("foundation:");
	expect(workflow).toContain("ui-typecheck-budget:");
	expect(workflow).toContain("ui-design-contracts:");
});
