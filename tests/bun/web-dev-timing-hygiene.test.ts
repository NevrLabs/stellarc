import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	DEV_TIMING_MEASURE_CAP,
	DEV_TIMING_RESOURCE_CAP,
	DEV_TIMING_TICK_MS,
	installDevTimingHygiene,
	sweepTimingBuffers,
} from "../../apps/web/src/lib/dev-timing-hygiene";

/**
 * NEVR-544 — the dev User Timing / resource-timing buffer cap (F5's law:
 * long-lived streaming pages carry a memory budget; instrumentation buffers
 * are capped by the app, not left to the browser).
 *
 * Part (a) pins the cap-and-clear decision logic and the tick; part (b)
 * pins the wiring in the house design-contracts style — the hook lives at
 * the app root, behind `import.meta.env.DEV`, and costs no dependency. Red
 * against the pre-NEVR-544 tree: the module and its root invocation do not
 * exist there, and every sweep assertion fails against an uncapped buffer.
 */

const ROOT = join(import.meta.dir, "..", "..");
const APP = join(ROOT, "apps", "web");
const HYGIENE = join(APP, "src", "lib", "dev-timing-hygiene.ts");
const ROOT_ROUTE = join(APP, "src", "routes", "__root.tsx");

/** Structural fake: answers both buffer kinds by name, counts every clear. */
class FakePerformance {
	measures = 0;
	resources = 0;
	clearMeasuresCalls = 0;
	clearResourceTimingsCalls = 0;

	getEntriesByType(type: string): PerformanceEntryList {
		const count = type === "resource" ? this.resources : this.measures;
		return new Array(count) as PerformanceEntryList;
	}

	clearMeasures(): void {
		this.clearMeasuresCalls += 1;
		this.measures = 0;
	}

	clearResourceTimings(): void {
		this.clearResourceTimingsCalls += 1;
		this.resources = 0;
	}
}

const asPerf = (fake: FakePerformance): Performance =>
	fake as unknown as Performance;

describe("NEVR-544 sweep: cap-and-clear decision logic", () => {
	test("a measure buffer past the cap is cleared; below the cap it is left alone", () => {
		const over = new FakePerformance();
		over.measures = DEV_TIMING_MEASURE_CAP + 1;
		let sweep = sweepTimingBuffers(asPerf(over));
		expect(sweep.clearedMeasures).toBe(true);
		expect(sweep.measures).toBe(DEV_TIMING_MEASURE_CAP + 1);
		expect(over.clearMeasuresCalls).toBe(1);
		expect(over.measures).toBe(0);

		const under = new FakePerformance();
		under.measures = DEV_TIMING_MEASURE_CAP - 1;
		sweep = sweepTimingBuffers(asPerf(under));
		expect(sweep.clearedMeasures).toBe(false);
		expect(under.clearMeasuresCalls).toBe(0);
		expect(under.measures).toBe(DEV_TIMING_MEASURE_CAP - 1);
	});

	test("the resource buffer clears at Chromium's full-and-dropping size (250)", () => {
		expect(DEV_TIMING_RESOURCE_CAP).toBe(250);

		const full = new FakePerformance();
		full.resources = 250;
		const sweep = sweepTimingBuffers(asPerf(full));
		expect(sweep.clearedResources).toBe(true);
		expect(full.clearResourceTimingsCalls).toBe(1);

		const roomLeft = new FakePerformance();
		roomLeft.resources = 249;
		expect(sweepTimingBuffers(asPerf(roomLeft)).clearedResources).toBe(false);
		expect(roomLeft.clearResourceTimingsCalls).toBe(0);
	});

	test("clearing one buffer never clears the other", () => {
		const onlyMeasures = new FakePerformance();
		onlyMeasures.measures = DEV_TIMING_MEASURE_CAP * 2;
		onlyMeasures.resources = 5;
		sweepTimingBuffers(asPerf(onlyMeasures));
		expect(onlyMeasures.clearMeasuresCalls).toBe(1);
		expect(onlyMeasures.clearResourceTimingsCalls).toBe(0);
		expect(onlyMeasures.resources).toBe(5);

		const onlyResources = new FakePerformance();
		onlyResources.measures = 3;
		onlyResources.resources = 10_000;
		sweepTimingBuffers(asPerf(onlyResources));
		expect(onlyResources.clearMeasuresCalls).toBe(0);
		expect(onlyResources.clearResourceTimingsCalls).toBe(1);
		expect(onlyResources.measures).toBe(3);
	});
});

describe("NEVR-544 tick: slow, bounded, and installed once", () => {
	test("the tick holds a fast retained emitter at the cap instead of letting the buffer grow", async () => {
		const fake = new FakePerformance();
		// A tick fast enough to test in-process; the shipped default stays
		// seconds-scale (asserted below).
		const stop = installDevTimingHygiene(asPerf(fake), 5);

		let emitted = 0;
		let peak = 0;
		const emitter = setInterval(() => {
			fake.measures += 250;
			emitted += 250;
			peak = Math.max(peak, fake.measures);
		}, 2);
		await Bun.sleep(120);
		clearInterval(emitter);
		stop();

		// Uncapped, every emitted measure would sit in the buffer (the
		// before-measurement grows linearly, ~183 retained entries/s, never
		// draining). With the tick, retention never runs far past one tick's
		// worth above the cap.
		expect(emitted).toBeGreaterThanOrEqual(DEV_TIMING_MEASURE_CAP * 2);
		expect(fake.clearMeasuresCalls).toBeGreaterThan(0);
		expect(peak).toBeLessThan(DEV_TIMING_MEASURE_CAP + 2_000);
	});

	test("install is idempotent: a second install (the HMR shape) never doubles the tick", async () => {
		const fake = new FakePerformance();
		const stopA = installDevTimingHygiene(asPerf(fake), 5);
		const stopB = installDevTimingHygiene(asPerf(fake), 5);

		fake.measures = DEV_TIMING_MEASURE_CAP;
		await Bun.sleep(20);
		const clearsWithBothInstalls = fake.clearMeasuresCalls;
		expect(clearsWithBothInstalls).toBeGreaterThan(0);

		stopA();
		fake.measures = DEV_TIMING_MEASURE_CAP;
		const afterStop = fake.clearMeasuresCalls;
		await Bun.sleep(20);
		// Exactly one tick ever ran: B installed nothing, and stopping A
		// stopped the only interval.
		expect(fake.clearMeasuresCalls).toBe(afterStop);
		stopB();
	});

	test("the shipped constants keep the brief's shape: few-thousand cap, seconds-scale tick", () => {
		expect(DEV_TIMING_MEASURE_CAP).toBeGreaterThanOrEqual(1_000);
		expect(DEV_TIMING_MEASURE_CAP).toBeLessThanOrEqual(10_000);
		expect(DEV_TIMING_TICK_MS).toBeGreaterThanOrEqual(1_000);
	});
});

describe("NEVR-544 wiring: one dev-gated owner at the app root", () => {
	test("the root route installs the hygiene tick behind import.meta.env.DEV", () => {
		const src = readFileSync(ROOT_ROUTE, "utf8");
		expect(src, "__root.tsx must keep the dev-only install call").toContain(
			"installDevTimingHygiene();",
		);
		expect(
			src,
			"the install must stay gated on import.meta.env.DEV (prod dead code)",
		).toMatch(/import\.meta\.env\.DEV/);
	});

	test("the hook is dependency-free: the module imports nothing", () => {
		expect(existsSync(HYGIENE), "dev-timing-hygiene.ts must exist").toBe(true);
		const src = readFileSync(HYGIENE, "utf8");
		expect(
			src.match(/^import\s/m),
			"dev-timing-hygiene.ts must stay import-free (zero new dependencies)",
		).toBeNull();
	});
});
