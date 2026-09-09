export const MIN_ZOOM = 1;

export type CropTransform = {
  /** Image translate x in viewport pixels. */
  x: number;
  /** Image translate y in viewport pixels. */
  y: number;
  /** Uniform scale; 1 = image rendered 1:1. */
  scale: number;
};

export type ImageDimensions = { width: number; height: number };

export type CropRect = {
  sourceX: number;
  sourceY: number;
  side: number;
};

/**
 * Initial transform: scale to COVER the square viewport (no letterboxing —
 * the crop mask is always fully over image), clamped to >= MIN_ZOOM so a
 * huge image is never rendered at a sub-1 scale that would crop from an
 * upscaled canvas, then centered.
 */
export function computeInitialTransform(
  image: ImageDimensions,
  viewport: number,
): CropTransform {
  const coverScale = Math.max(viewport / image.width, viewport / image.height);
  const scale = Math.max(MIN_ZOOM, coverScale);
  return {
    scale,
    x: (viewport - image.width * scale) / 2,
    y: (viewport - image.height * scale) / 2,
  };
}

/**
 * Keep the rendered image covering the viewport while panning: the image edge
 * may never enter the viewport, so x ∈ [viewport - rendered, 0]. A
 * cover-exact image (rendered == viewport) pins to 0 with no slack.
 */
export function clampPan(
  x: number,
  renderedSize: number,
  viewport: number,
): number {
  if (renderedSize <= viewport) {
    return (viewport - renderedSize) / 2;
  }
  const min = viewport - renderedSize;
  return Math.min(0, Math.max(min, x));
}

/**
 * Convert the interactive transform back to the source-image square: the
 * viewport center mapped into image coordinates, side shrunk by scale.
 * Clamped so rounding can never push the rect outside the image.
 */
export function cropRectFromTransform(
  transform: CropTransform,
  image: ImageDimensions,
  viewport: number,
): CropRect {
  const centerX = (viewport / 2 - transform.x) / transform.scale;
  const centerY = (viewport / 2 - transform.y) / transform.scale;
  const side = viewport / transform.scale;
  const half = side / 2;

  const sourceX = Math.min(
    Math.max(0, Math.round(centerX - half)),
    Math.max(0, Math.round(image.width - side)),
  );
  const sourceY = Math.min(
    Math.max(0, Math.round(centerY - half)),
    Math.max(0, Math.round(image.height - side)),
  );

  return { sourceX, sourceY, side: Math.round(side) };
}
