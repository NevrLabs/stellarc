import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
	hashApiKey,
	isValidApiKeyHash,
	KNOWN_ANSWER_RAWS,
	loadManifest,
	validateCorpus,
} from "../../tools/reconciliation/canon";

describe("R01 canon corpus validation", () => {
	test("exactly 14 query files, unique contiguous ids, complete headers, 16 sabotages", async () => {
		const manifest = await loadManifest();
		expect(manifest.canon_count).toBe(14);
		expect(manifest.sabotage_count).toBe(16);
		const result = await validateCorpus(manifest);
		expect(result.errors).toEqual([]);
		expect(result.ok).toBe(true);
		expect(result.queryIds).toEqual(
			Array.from({ length: 14 }, (_, i) => i + 1),
		);
		expect(result.sabotageCount).toBe(16);
		// per-query sabotage counts sum to 16 and map to the query ids
		const sabotages = manifest.queries.flatMap((q) => q.sabotages);
		expect(sabotages).toHaveLength(16);
		expect(manifest.queries.map((q) => q.id)).toEqual(
			Array.from({ length: 14 }, (_, i) => i + 1),
		);
	});

	test("negative control: a missing canon file is reported, not green", async () => {
		const manifest = await loadManifest();
		const broken = {
			...manifest,
			queries: manifest.queries.map((q) =>
				q.id === 1
					? {
							...q,
							file: "docs/legacy/reconciliation/queries/01-DOES-NOT-EXIST.sql",
						}
					: q,
			),
		};
		const result = await validateCorpus(broken);
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes("header missing"))).toBe(true);
	});
});

describe("R19 apikey hash known-answer (fork algorithm)", () => {
	test("stored hash is unpadded base64url SHA256 of the raw key", async () => {
		const manifest = await loadManifest();
		for (const { raw } of manifest.known_answers.apikey_sha256_base64url) {
			const expected = hashApiKey(raw);
			expect(expected).toHaveLength(43);
			expect(isValidApiKeyHash(expected)).toBe(true);
			// fork algorithm ground truth: sha256 -> base64 -> url-safe, unpadded
			const manual = createHash("sha256")
				.update(raw)
				.digest("base64")
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=/g, "");
			expect(expected).toBe(manual);
		}
	});

	test("negative control: hex or padded encoding does NOT verify", () => {
		const raw = KNOWN_ANSWER_RAWS[0];
		const hex = createHash("sha256").update(raw).digest("hex");
		const padded = createHash("sha256").update(raw).digest("base64");
		expect(hex).not.toBe(hashApiKey(raw));
		expect(padded).not.toBe(hashApiKey(raw));
		expect(isValidApiKeyHash(hex)).toBe(false);
		expect(isValidApiKeyHash(padded)).toBe(false);
	});
});

describe("R19 fixture linkage (defect 7)", () => {
	// The manifest's reference_id linkage must pin the ALGORITHM to the FIXTURE:
	// for every known-answer row, the restored destination apikey row identified
	// by reference_id must store exactly hashApiKey(raw). Asserted here at the
	// seed-source level (the same template the integration fixture restores from)
	// so a generator switched to any other 43-char hash fails, while the pure
	// function tests above stay algorithm-vs-reimplementation only.
	test("every known-answer row's stored hash equals hashApiKey(raw) via the destination seed", async () => {
		const { destinationSeedSql } = await import(
			"../../tools/reconciliation/canon"
		);
		const seed = destinationSeedSql();
		const manifest = await loadManifest();
		for (const { raw, reference_id } of manifest.known_answers
			.apikey_sha256_base64url) {
			// the seed materializes the apikey row for this reference_id
			expect(seed).toContain(`'${reference_id}','sk-`);
			// ...with the hash of the manifest-declared raw (exact row content)
			expect(seed).toContain(`'${hashApiKey(raw)}'`);
		}
		// negative control: a hypothetical wrong algorithm (truncated sha512,
		// also 43 chars) must NOT appear anywhere in the seed
		const wrong = createHash("sha512")
			.update(KNOWN_ANSWER_RAWS[0])
			.digest("base64url")
			.slice(0, 43);
		expect(wrong).toHaveLength(43);
		expect(destinationSeedSql()).not.toContain(`'${wrong}'`);
	});
});

describe("R24 gate discovery", () => {
	// R24: the reconciliation suites must execute under the root `bun test` gate
	// through the vitest bridge (tests/gates.test.ts -> vitest run --config
	// vitest.integration.config.ts). Discovery is guarded two ways:
	//   (a) statically — the bridge exists, runs the integration config, and
	//       that config's glob covers the reconciliation suite (removing the
	//       suite from the glob breaks this assertion), and
	//   (b) dynamically — a test file under that glob whose assertion fails
	//       makes the vitest run exit nonzero; gates.test.ts then fails its
	//       expect(exit).toBe(0) and the root gate goes red. The live RED replay
	//       of both arms is recorded in docs/legacy/reconciliation/README.md.
	const repoRoot = import.meta.dirname.replace(/\/tests\/unit$/, "");

	test("(a) bridge runs the integration config and its glob includes the reconciliation suite", async () => {
		const { readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const gates = await readFile(join(repoRoot, "tests/gates.test.ts"), "utf8");
		expect(gates).toContain("vitest.integration.config.ts");
		expect(gates).toContain("vitest.config.ts");
		const integrationCfg = await readFile(
			join(repoRoot, "vitest.integration.config.ts"),
			"utf8",
		);
		expect(integrationCfg).toContain("tests/integration/**/*.test.ts");
		// the suite covered by that glob exists (removal from the tree, or a glob
		// that no longer covers it, fails here)
		const stat = await import("node:fs").then((m) =>
			m.existsSync(join(repoRoot, "tests/integration/reconciliation.test.ts")),
		);
		expect(stat).toBe(true);
	});

	test("(b) negative control: an intentionally failing test under the glob fails the vitest run (nonzero exit)", {
		timeout: 120_000,
	}, async () => {
		const { writeFile, rm } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const { spawnSync } = await import("node:child_process");
		// one variable: a probe test inside the glob with a failing assertion
		const probePath = join(repoRoot, "tests/integration/_r24-probe.test.ts");
		await writeFile(
			probePath,
			[
				'import { expect, test } from "vitest";',
				'test("R24 intentional assertion failure", () => {',
				"	expect(1).toBe(2);",
				"});",
				"",
			].join("\n"),
		);
		try {
			const run = spawnSync(
				process.execPath,
				[
					"--bun",
					"node_modules/vitest/vitest.mjs",
					"run",
					"--config",
					"vitest.integration.config.ts",
					"_r24-probe",
				],
				{ cwd: repoRoot, encoding: "utf8", timeout: 110_000 },
			);
			expect(
				run.status,
				`vitest stdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
			).not.toBe(0);
			expect(run.stdout).toContain("R24 intentional assertion failure");
			expect(`${run.stdout}\n${run.stderr}`).toMatch(
				/AssertionError|expected .* to be/,
			);
		} finally {
			await rm(probePath, { force: true });
		}
	});
});
