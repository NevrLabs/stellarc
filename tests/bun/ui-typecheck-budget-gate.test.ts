import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * NEVR-799 — the ui-typecheck-budget gate's compiler-exit contract.
 *
 * typescript 7.x (the native compiler this tree pins at the root) exits 1
 * when the program emits diagnostics; tsc 5 exited 2. The gate used to
 * accept only (0, 2), so the TS7 root major reddened the job with
 * "Compiler failed without a usable diagnostic report" even though the
 * report was perfectly usable. This test executes the workflow's own
 * embedded gate script against synthetic logs, pinning the contract:
 *
 *   - exit 1 with diagnostics is a usable report (budget still enforced)
 *   - exit 2 with diagnostics stays a usable report (tsc 5 semantics)
 *   - exit 0 is success
 *   - exit 1 or 2 with ZERO parsed diagnostics is a crash, not a report
 *   - any other exit code is rejected
 *
 * Sabotage control: revert the accept-set in ci.yml to `(0, 2)` and the
 * exit-1 cases here go red.
 */

const ROOT = join(import.meta.dir, "..", "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "ci.yml");

function extractGateScript(): string {
	const workflow = readFileSync(WORKFLOW, "utf8");
	const match = workflow.match(
		/python3 - "\$status" <<'PY'\n([\s\S]*?)\n\s*PY\b/,
	);
	expect(match, "ci.yml keeps an embedded python3 gate script").not.toBeNull();
	// The raw workflow text keeps the YAML block indent on every line; the
	// shell heredoc strips it in CI, so strip the first line's indent here.
	const lines = (match?.[1] ?? "").split("\n");
	const first = lines.find((l) => l.trim().length > 0) ?? "";
	const indent = first.length - first.trimStart().length;
	const strip = (l: string): string => {
		if (l.trim().length === 0) return "";
		const lead = l.length - l.trimStart().length;
		return l.slice(Math.min(indent, lead));
	};
	return lines.map(strip).join("\n");
}

const GATE_SCRIPT = extractGateScript();

function runGate(status: number, diagnostics: number, budget: number) {
	const dir = mkdtempSync(join(tmpdir(), "ui-budget-gate-"));
	mkdirSync(join(dir, ".forge"));
	const log = Array.from({ length: diagnostics }, (_, i) => {
		const code = [
			"TS2339",
			"TS7053",
			"TS7006",
			"TS6133",
			"TS2322",
			"TS18046",
		][i % 6];
		return `src/file${i}.ts(1,1): error ${code}: synthetic diagnostic ${i}`;
	}).join("\n");
	writeFileSync(join(dir, "ui-typecheck.log"), `${log}\n`);
	writeFileSync(
		join(dir, ".forge", "ui-typecheck-budget.json"),
		JSON.stringify({ count: budget, at: "0".repeat(40) }),
	);
	const summary = join(dir, "summary.md");
	const proc = spawnSync("python3", ["-", String(status)], {
		input: GATE_SCRIPT,
		cwd: dir,
		env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
	});
	return {
		status: proc.status ?? -1,
		summary: readFileSync(summary, "utf8"),
	};
}

test("NEVR-799 gate contract: TS7 exit 1 with diagnostics is a usable report", () => {
	const r = runGate(1, 3, 5);
	expect(r.status, "TS7 exit code 1 must be accepted when diagnostics parse").toBe(0);
	expect(r.summary).toContain("compiler exit: 1");
});

test("NEVR-799 gate contract: legacy tsc 5 exit 2 with diagnostics still accepted", () => {
	expect(runGate(2, 3, 5).status).toBe(0);
});

test("NEVR-799 gate contract: exit 0 is success", () => {
	expect(runGate(0, 0, 5).status).toBe(0);
});

test("NEVR-799 gate contract: non-zero exit with zero diagnostics is rejected", () => {
	expect(runGate(1, 0, 5).status).not.toBe(0);
	expect(runGate(2, 0, 5).status).not.toBe(0);
});

test("NEVR-799 gate contract: unknown exit codes are rejected", () => {
	expect(runGate(3, 3, 5).status).not.toBe(0);
	expect(runGate(127, 3, 5).status).not.toBe(0);
});

test("NEVR-799 gate contract: the budget still bites under exit 1", () => {
	expect(runGate(1, 6, 5).status).not.toBe(0);
});

test("NEVR-799 budget file: recorded count is an integer with a commit anchor", () => {
	const budget = JSON.parse(
		readFileSync(join(ROOT, ".forge", "ui-typecheck-budget.json"), "utf8"),
	) as { count: number; at: string };
	expect(Number.isInteger(budget.count)).toBe(true);
	expect(budget.at).toMatch(/^[0-9a-f]{40}$/);
});
