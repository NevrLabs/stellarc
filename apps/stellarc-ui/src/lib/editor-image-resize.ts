/** Bounds for manual image resizing inside the description/comment editors. */
export const MIN_IMAGE_WIDTH = 64;
export const MAX_IMAGE_WIDTH = 1200;

/** Keeps a dragged width inside sane bounds (and off NaN). */
export function clampImageWidth(
  width: number,
  max: number = MAX_IMAGE_WIDTH,
): number {
  if (!Number.isFinite(width)) return MIN_IMAGE_WIDTH;
  const upperBound = Math.max(MIN_IMAGE_WIDTH, Math.round(max));
  return Math.min(Math.max(Math.round(width), MIN_IMAGE_WIDTH), upperBound);
}

/**
 * Class list for an editor image.
 *
 * The selected state is a class rather than a `:focus` style because a
 * ProseMirror node selection does not move DOM focus — the outline has to be
 * driven from the node view's `selectNode`/`deselectNode` callbacks.
 */
export function imageWrapperClass(selected: boolean): string {
  return selected
    ? "kaneo-editor-image-wrapper is-selected"
    : "kaneo-editor-image-wrapper";
}

/**
 * Filename an image URL points at, for use as a human-readable tooltip.
 *
 * Kaneo asset URLs look like `/api/asset/<cuid>`, where the last segment is an
 * opaque id rather than a name. Those are reported as a generic "Image" so the
 * tooltip never shows a meaningless identifier; real filenames (with an
 * extension) are used as-is.
 */
export function imageNameFromUrl(url: string): string {
  const withoutQuery = (url || "").split(/[?#]/)[0];
  const segment = withoutQuery.split("/").filter(Boolean).pop() || "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  // An opaque id has no extension; showing it would be noise, not information.
  return /\.[a-z0-9]{2,5}$/i.test(decoded) ? decoded : "";
}

/**
 * Tooltip text for an image: prefers an explicit title, then alt, then the
 * filename from the URL.
 *
 * Generic placeholders are ignored: markdown pasted as `![image](...)` gives
 * every image the alt text "image", which is a useless tooltip.
 */
export function imageTooltip(
  title: string | null | undefined,
  alt: string | null | undefined,
  fallback: string,
): string {
  const generic = /^(image|img|screenshot|picture|photo)$/i;
  const candidates = [title, alt].map((value) => (value || "").trim());
  for (const candidate of candidates) {
    if (candidate && !generic.test(candidate)) return candidate;
  }
  return imageNameFromUrl(fallback) || "Image";
}
