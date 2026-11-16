import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

test("desktop signing is opt-in and still refuses missing credentials", () => {
	const workflow = parse(
		readFileSync(
			join(import.meta.dir, "../../.github/workflows/desktop.yml"),
			"utf8",
		),
	);
	expect(workflow.on.workflow_dispatch.inputs.signed_bundles).toMatchObject({
		type: "boolean",
		default: false,
	});
	expect(workflow.jobs["bundle-signed"].if).toBe(
		"github.event_name == 'workflow_dispatch' && inputs.signed_bundles",
	);
	for (const job of ["cargo-check", "bundle-linux", "linux-smoke"]) {
		expect(workflow.jobs[job].if).toBeUndefined();
	}
	expect(workflow.jobs["maestro-desktop"].needs).toBe("bundle-signed");
	const steps: { name?: string; uses?: string }[] =
		workflow.jobs["bundle-signed"].steps;
	const build = steps.findIndex((s) => s.uses?.startsWith("tauri-apps/"));
	for (const platform of ["Windows", "macOS"]) {
		const guard = steps.findIndex(
			(s) =>
				s.name === `fail closed on missing ${platform} signing secret (T07/O2)`,
		);
		expect(guard, `${platform} guard runs before the build`).toBeLessThan(
			build,
		);
	}
	for (const platform of ["Windows", "macOS"]) {
		const step = workflow.jobs["bundle-signed"].steps.find(
			(s: { name?: string }) =>
				s.name === `fail closed on missing ${platform} signing secret (T07/O2)`,
		);
		expect(step).toBeDefined();
		const result = spawnSync("bash", ["-c", step.run], {
			env: { PATH: process.env.PATH },
			encoding: "utf8",
		});
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("refusing to ship an unsigned");
	}
});
