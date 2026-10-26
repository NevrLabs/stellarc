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
 * job or flipping it to a gate makes this test red.
 */

const ROOT = join(import.meta.dir, "..", "..");

test("NEVR-332 CI: onsystem diff job exists, non-blocking, scoped to the UI app", () => {
	const workflow = readFileSync(
		join(ROOT, ".github", "workflows", "ci.yml"),
		"utf8",
	);
	const job = workflow.split("onsystem-diff:", 2)[1]?.slice(0, 2000) ?? "";
	expect(job, "onsystem-diff job exists").toContain("continue-on-error: true");
	expect(job).toContain("uses: dgesteves/onsystem@v0");
	expect(job).toContain("working-directory: apps/stellarc-ui");
	// The action diffs against event.pull_request.base.sha itself; the job
	// must hand it a full checkout to do so.
	expect(job).toContain("fetch-depth: 0");
	// The trial is additive: no existing job removed, no new gate anywhere.
	expect(workflow).toContain("foundation:");
	expect(workflow).toContain("ui-typecheck-budget:");
	expect(workflow).toContain("ui-design-contracts:");
});
