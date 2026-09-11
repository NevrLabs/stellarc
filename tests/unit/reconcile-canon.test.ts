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
