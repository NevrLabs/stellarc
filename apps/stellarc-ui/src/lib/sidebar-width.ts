/**
 * Width rules for the resizable app sidebar.
 *
 * Pure functions, tested directly — the drag handler and the store both call
 * into these so clamping behaviour cannot drift between them.
 */

/** Default matches the previous fixed width (spacing*60 = 15rem = 240px). */
export const SIDEBAR_DEFAULT_WIDTH_PX = 240;
/** Narrow enough for icon+label rows to stay usable. */
export const SIDEBAR_MIN_WIDTH_PX = 192;
/** Hard ceiling; the ratio clamp below usually bites first. */
export const SIDEBAR_MAX_WIDTH_PX = 480;
/** The sidebar may never take more than this share of the viewport. */
const MAX_VIEWPORT_RATIO = 0.4;

export function clampSidebarWidth(
  width: number,
  viewportWidth: number,
): number {
  /*
    The ratio ceiling can fall BELOW the minimum on narrow windows, which
    would make Math.min(...) return a value smaller than the minimum. The
    minimum wins: a sidebar that is too wide for a tiny window is the
    mobile sheet's problem (resize is desktop-only), not the clamp's.
  */
  const ratioMax = Math.floor(viewportWidth * MAX_VIEWPORT_RATIO);
  const max = Math.max(
    SIDEBAR_MIN_WIDTH_PX,
    Math.min(SIDEBAR_MAX_WIDTH_PX, ratioMax),
  );
  return Math.min(Math.max(Math.round(width), SIDEBAR_MIN_WIDTH_PX), max);
}

/**
 * Parse a persisted width. Storage is user-writable, so anything that is not
 * a finite number falls back to the default — and even valid numbers are
 * re-clamped against the CURRENT viewport, not the one they were saved on.
 */
export function parseStoredSidebarWidth(
  stored: unknown,
  viewportWidth: number,
): number {
  const value =
    typeof stored === "number"
      ? stored
      : Number.parseInt(String(stored ?? ""), 10);
  if (!Number.isFinite(value)) {
    return clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH_PX, viewportWidth);
  }
  return clampSidebarWidth(value, viewportWidth);
}

/** Left-anchored sidebar: the width IS the pointer's x position. */
export function sidebarWidthFromPointer(
  clientX: number,
  viewportWidth: number,
): number {
  return clampSidebarWidth(clientX, viewportWidth);
}
