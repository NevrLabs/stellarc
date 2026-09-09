export type OverlayPoint = { top: number; left: number };

/**
 * Minimum movement (px) before a floating editor overlay is repositioned.
 *
 * Opening the `#` reference popup changes the layout of the task drawer (a
 * scrollbar appears / the sheet reflows), which moves the caret rect by a pixel
 * or two. Re-reading that rect on every suggestion update fed the movement
 * straight back into the popup position and the dropdown visibly jittered.
 * Ignoring sub-threshold movement breaks that measure -> reflow -> measure loop
 * while still following the caret when it genuinely moves (new line, typing
 * past the edge, scrolling).
 */
export const OVERLAY_REPOSITION_THRESHOLD = 12;

export function shouldRepositionOverlay(
  previous: OverlayPoint | null | undefined,
  next: OverlayPoint,
  threshold: number = OVERLAY_REPOSITION_THRESHOLD,
): boolean {
  if (!previous) return true;
  return (
    Math.abs(previous.top - next.top) >= threshold ||
    Math.abs(previous.left - next.left) >= threshold
  );
}
