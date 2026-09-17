import { expect, test } from "vitest";
import { ceilingFromResults } from "../../tools/measure-shape-concurrency.mts";

// S12: concurrency-harness self-check. The canary logic must report the
// ceiling of a limiting proxy configured at 2 (canary shape stalls ->
// detected), and must not false-stall at N<=4 unlimited. The real browser
// numbers are documented evidence, not a CI gate.

test("S12 ceilingFromResults detects the conn-cap-2 stall and never false-stalls", () => {
	// A cap-2 proxy: shapes 1 and 2 stream, shape 3+ stall behind the cap.
	const capped = {
		"1": true,
		"2": true,
		"3": false,
		"4": false,
		"5": false,
		"6": false,
		"7": false,
		"8": false,
	};
	expect(ceilingFromResults(capped, 8)).toEqual({
		stalledShapeId: 3,
		ceiling: 2,
	});
	// Unlimited at N<=4: nothing stalls; reporting >=6 here would be the
	// failure mode (a false stall).
	for (const n of [1, 2, 3, 4]) {
		const unlimited = Object.fromEntries(
			Array.from({ length: n }, (_, i) => [String(i + 1), true]),
		);
		const verdict = ceilingFromResults(unlimited, n);
		expect(verdict.stalledShapeId).toBe(0);
		expect(verdict.ceiling).toBe(n);
	}
	// Connection stalls mid-pack (shape 2 dead, 3 alive) still report the
	// FIRST stall - the ceiling is the prefix of live connections.
	const gapped = { "1": true, "2": false, "3": true, "4": true };
	expect(ceilingFromResults(gapped, 4)).toEqual({
		stalledShapeId: 2,
		ceiling: 1,
	});
});
