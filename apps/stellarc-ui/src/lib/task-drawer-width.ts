/**
 * Persisted width for the task detail drawer (#112).
 *
 * Kept as a pure module so the clamping and parsing rules can be tested
 * without mounting the sheet: the component only wires pointer events to
 * these functions.
 */

export const TASK_DRAWER_MIN_WIDTH = 420;
export const TASK_DRAWER_DEFAULT_WIDTH = 768;
/** Never let the drawer swallow the whole viewport — the board must stay visible. */
export const TASK_DRAWER_MAX_VIEWPORT_RATIO = 0.9;
export const TASK_DRAWER_WIDTH_STORAGE_KEY = "kaneo:task-drawer-width";

/**
 * Upper bound for a given viewport.
 *
 * Also guards the degenerate case of a viewport narrower than the minimum
 * (very small windows): the max must never fall below the min or the clamp
 * range inverts.
 */
export function maxTaskDrawerWidth(viewportWidth: number): number {
  const ratioMax = Math.floor(viewportWidth * TASK_DRAWER_MAX_VIEWPORT_RATIO);
  return Math.max(TASK_DRAWER_MIN_WIDTH, ratioMax);
}

/** Constrain a candidate width to the allowed range for this viewport. */
export function clampTaskDrawerWidth(
  width: number,
  viewportWidth: number,
): number {
  if (!Number.isFinite(width)) return TASK_DRAWER_DEFAULT_WIDTH;
  return Math.min(
    Math.max(Math.round(width), TASK_DRAWER_MIN_WIDTH),
    maxTaskDrawerWidth(viewportWidth),
  );
}

/**
 * Parse a persisted value defensively.
 *
 * localStorage is user-writable and survives across releases, so anything can
 * be in there — including values saved when the window was far wider than it
 * is now. Garbage and out-of-range values both fall back to a usable width.
 */
export function parseStoredTaskDrawerWidth(
  raw: string | null | undefined,
  viewportWidth: number,
): number {
  if (!raw)
    return clampTaskDrawerWidth(TASK_DRAWER_DEFAULT_WIDTH, viewportWidth);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return clampTaskDrawerWidth(TASK_DRAWER_DEFAULT_WIDTH, viewportWidth);
  }
  return clampTaskDrawerWidth(parsed, viewportWidth);
}

/**
 * Width produced by dragging the left edge of a right-anchored drawer.
 *
 * The drawer is pinned to the right, so dragging left (smaller clientX) makes
 * it wider — the width is the distance from the pointer to the right edge.
 */
export function widthFromPointer(
  clientX: number,
  viewportWidth: number,
): number {
  return clampTaskDrawerWidth(viewportWidth - clientX, viewportWidth);
}
