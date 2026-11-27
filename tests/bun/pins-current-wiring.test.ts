import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * NEVR-833 — wiring guard for the pins-current advisory comment upsert.
 *
 * The advisory's post step found its previous PR comment by marker but
 * PATCHed the nested per-comment URL (`/repos/{owner}/{repo}/issues/
 * {n}/comments/{id}`), which the GitHub REST API 404s — the update-issue-
 * comment endpoint is flat: `/repos/{owner}/{repo}/issues/comments/{id}`.
 * Advisory-by-construction turned the 404 into `::warning` + a green job,
 * so PR #352's comment froze at 2026-11-23 while the check stayed green
 * for days — job greenness is not freshness (NEVR-724's founding law).
 *
 * Part (a) pins the fix: the update call targets the flat endpoint, and
 * its failure fallback stays a warning (the job reports, the executor
 * decides). Part (b) pins the boundary: the list (GET) and create (POST)
 * calls keep the nested collection URL — that shape is correct for them,
 * it is only the per-comment PATCH that must not compose from it — and
 * no PATCH anywhere in the file targets the nested per-comment form.
 */

const ROOT = join(import.meta.dir, "..", "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "pins-current.yml");

/** The nested collection URL — correct for GET/POST, 404 for PATCH. */
const COLLECTION_URL =
	// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter text, not a JS template
	'api="${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments"';
/** The flat per-comment URL the PATCH must target. */
const FLAT_COMMENT_URL =
	// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter text, not a JS template
	"${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/comments/${comment_id}";
/** The per-comment composition of the collection URL — the 404 shape. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter text, not a JS template
const NESTED_COMMENT_URL = "${api}/${comment_id}";

type WorkflowStep = { name?: string; run?: string };

/** The "Post or update the PR comment" step's shell script, from the YAML. */
function postStepRun(): string {
	const wf = parse(readFileSync(WORKFLOW, "utf8")) as {
		jobs?: Record<string, { steps?: WorkflowStep[] }>;
	};
	const steps = wf.jobs?.["pins-current"]?.steps ?? [];
	const step = steps.find((s) =>
		s.name?.includes("Post or update the PR comment"),
	);
	return String(step?.run ?? "");
}

/** Shell lines issuing a PATCH, over the whole raw file — a PATCH added
 * anywhere else must still obey the same flat-endpoint law. */
function patchLines(): string[] {
	return readFileSync(WORKFLOW, "utf8")
		.split("\n")
		.filter((line) => line.includes("-X PATCH"));
}

test("NEVR-833 wiring: the update PATCH targets the flat issues/comments/{id} endpoint", () => {
	const run = postStepRun();
	expect(run, "the advisory post step must exist").toBeTruthy();

	const patches = run.split("\n").filter((line) => line.includes("-X PATCH"));
	expect(
		patches.length,
		"exactly one PATCH call — a single advisory comment to upsert",
	).toBe(1);
	const update = patches[0] ?? "";
	expect(
		update,
		"the PATCH must target the flat update-issue-comment endpoint",
	).toContain(FLAT_COMMENT_URL);
	expect(
		update,
		"the PATCH must not compose the per-comment URL from the collection api",
	).not.toContain(NESTED_COMMENT_URL);
});

test("NEVR-833 boundary: list/create keep the collection URL; no PATCH ever targets the nested per-comment form", () => {
	const run = postStepRun();
	expect(
		run,
		"the list/create collection URL must stay bound exactly as shipped",
	).toContain(COLLECTION_URL);
	expect(run, "the list call must still GET the collection").toContain(
		'req "$api"',
	);
	expect(run, "the create call must still POST the collection").toContain(
		'req -X POST --data "$payload" "$api"',
	);

	for (const line of patchLines()) {
		expect(
			line,
			"PATCH must not compose the per-comment URL from the collection api",
		).not.toContain(NESTED_COMMENT_URL);
		expect(
			line,
			"PATCH must not hand-write the nested per-comment URL either",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter text, not a JS template
		).not.toContain("issues/${PR_NUMBER}/comments/${comment_id}");
	}
});

test("NEVR-833 advisory semantics: a failed update stays a warning, never a job failure", () => {
	const run = postStepRun();
	const lines = run.split("\n");
	const index = lines.findIndex((line) => line.includes("-X PATCH"));
	expect(index, "the update call must exist").toBeGreaterThanOrEqual(0);
	expect(
		lines[index + 1],
		"the PATCH fallback must stay a ::warning, not an error",
	).toContain("::warning::pins-current: failed to update PR comment");
	// `set -uo pipefail` without -e is what makes the step advisory:
	// curl failures degrade to warnings instead of failing the job.
	expect(run, "the step must keep set -uo pipefail").toContain(
		"set -uo pipefail",
	);
	expect(run, "the step must not gain set -e").not.toContain("set -euo");
});
