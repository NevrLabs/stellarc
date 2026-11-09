/**
 * NEVR-544 — cap the dev User Timing buffer (MUL-8781 class, F5's law).
 *
 * The browser never drains the User Timing buffer on its own: any dev-time
 * emitter that does not clear after itself is retained for the life of the
 * page. React's own dev instrumentation is the known emitter of the class —
 * the 19.2 line measured every render and never cleared (Multica MUL-8781:
 * a two-day dev tab at 30 GB+) — while our 19.3.1 pin emits and immediately
 * clears each measure (observer-verified 2026-11-08: ~180 measures/s emitted,
 * retained buffer 0). This cap therefore guards the buffer class, not one
 * emitter: whatever writes retained measures, a long-lived dev session
 * (dogfooding tabs stay open for days) stays bounded.
 *
 * The resource-timing buffer fails the other way: Chromium caps it at 250
 * entries by default and silently drops every entry once it is full —
 * observed stuck at 250 while route churn kept loading chunks — so a
 * cap-and-clear keeps the buffer rolling instead of full-and-dead.
 *
 * Dev-only by construction: the sole caller is the DEV-gated call in
 * `routes/__root.tsx`, which Rollup dead-code-eliminates from the
 * production build (grep-verified: the built client contains no
 * `clearMeasures`/`clearResourceTimings`).
 */

/** A few thousand retained measures, per the F5 brief. */
export const DEV_TIMING_MEASURE_CAP = 5_000;

/**
 * Chromium's default resource-timing buffer limit. At this size the buffer
 * is full and dropping new entries; clearing here keeps it rolling.
 */
export const DEV_TIMING_RESOURCE_CAP = 250;

/** A slow tick — seconds, not milliseconds; nothing here is per-render. */
export const DEV_TIMING_TICK_MS = 2_000;

export interface DevTimingSweep {
	measures: number;
	resources: number;
	clearedMeasures: boolean;
	clearedResources: boolean;
}

/**
 * One cap-and-clear pass over both instrumentation buffers. Pure decision
 * logic over the injected `Performance` — no globals touched, trivially
 * testable.
 */
export function sweepTimingBuffers(
	perf: Pick<
		Performance,
		"getEntriesByType" | "clearMeasures" | "clearResourceTimings"
	>,
	measureCap = DEV_TIMING_MEASURE_CAP,
	resourceCap = DEV_TIMING_RESOURCE_CAP,
): DevTimingSweep {
	const measures = perf.getEntriesByType("measure").length;
	const resources = perf.getEntriesByType("resource").length;
	const clearedMeasures = measures >= measureCap;
	const clearedResources = resources >= resourceCap;
	if (clearedMeasures) {
		perf.clearMeasures();
	}
	if (clearedResources) {
		perf.clearResourceTimings();
	}
	return { measures, resources, clearedMeasures, clearedResources };
}

const INSTALL_FLAG = "__stellarcDevTimingHygiene";

/**
 * Install the slow cap-and-clear tick. Called exactly once, from the app
 * root. Idempotent across Vite HMR re-evaluations (the guard lives on
 * `globalThis`, which hot reloads do not reset); returns a stop function
 * used by tests — the app never stops the tick.
 */
export function installDevTimingHygiene(
	perf: Pick<
		Performance,
		"getEntriesByType" | "clearMeasures" | "clearResourceTimings"
	> = performance,
	tickMs: number = DEV_TIMING_TICK_MS,
): () => void {
	const holder = globalThis as Record<string, unknown>;
	if (holder[INSTALL_FLAG]) {
		return () => {};
	}
	holder[INSTALL_FLAG] = true;
	const tick = () => {
		sweepTimingBuffers(perf);
	};
	const handle = setInterval(tick, tickMs);
	tick();
	return () => {
		holder[INSTALL_FLAG] = undefined;
		clearInterval(handle);
	};
}
