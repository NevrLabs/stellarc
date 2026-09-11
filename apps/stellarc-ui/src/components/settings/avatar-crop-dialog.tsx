import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CropRect,
  clampPan,
  computeInitialTransform,
  cropRectFromTransform,
  type ImageDimensions,
  MIN_ZOOM,
} from "@/lib/avatar-crop";
import { AVATAR_OUTPUT_SIZE } from "@/lib/prepare-avatar-image";

const MAX_ZOOM = 8;

type Props = {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onCropped: (file: File) => void;
};

/**
 * Avatar crop selector: circular mask over a zoomable, pannable preview.
 * Replaces the blind center-crop that prepareAvatarImage used to apply —
 * users could not see or adjust what the middle square would cut off.
 * Export reuses the same 256x256 WebP/PNG pipeline via canvas.
 */
export default function AvatarCropDialog({
  open,
  file,
  onCancel,
  onCropped,
}: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [transform, setTransform] = useState({
    x: 0,
    y: 0,
    scale: MIN_ZOOM,
  });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Decode the selected file into an <img> for preview + canvas export.
  useEffect(() => {
    if (!open || !file) {
      setImage(null);
      setDimensions(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImage(el);
      setDimensions({ width: el.naturalWidth, height: el.naturalHeight });
    };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  useEffect(() => {
    if (dimensions) {
      setTransform(computeInitialTransform(dimensions, AVATAR_OUTPUT_SIZE));
    }
  }, [dimensions]);

  const viewport = AVATAR_OUTPUT_SIZE;

  const zoomBy = useCallback(
    (factor: number) => {
      if (!dimensions) return;
      setTransform((t) => {
        const nextScale = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, t.scale * factor),
        );
        // zoom to viewport center: keep the image point under the center fixed
        const cx = viewport / 2;
        const cy = viewport / 2;
        const imgX = (cx - t.x) / t.scale;
        const imgY = (cy - t.y) / t.scale;
        const nextX = clampPan(
          cx - imgX * nextScale,
          dimensions.width * nextScale,
          viewport,
        );
        const nextY = clampPan(
          cy - imgY * nextScale,
          dimensions.height * nextScale,
          viewport,
        );
        return { x: nextX, y: nextY, scale: nextScale };
      });
    },
    [dimensions, viewport],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX - transform.x,
      startY: event.clientY - transform.y,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !dimensions) return;
    const nextX = clampPan(
      event.clientX - drag.startX,
      dimensions.width * transform.scale,
      viewport,
    );
    const nextY = clampPan(
      event.clientY - drag.startY,
      dimensions.height * transform.scale,
      viewport,
    );
    setTransform((t) => ({ ...t, x: nextX, y: nextY }));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const handleSave = useCallback(async () => {
    if (!image || !dimensions) return;
    setExporting(true);
    try {
      const rect: CropRect = cropRectFromTransform(
        transform,
        dimensions,
        viewport,
      );
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The image could not be processed.");
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        rect.sourceX,
        rect.sourceY,
        rect.side,
        rect.side,
        0,
        0,
        AVATAR_OUTPUT_SIZE,
        AVATAR_OUTPUT_SIZE,
      );
      const blob =
        (await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.9),
        )) ??
        (await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        ));
      if (!blob) throw new Error("The image could not be processed.");
      onCropped(
        new File([blob], "avatar.webp", { type: blob.type || "image/webp" }),
      );
    } finally {
      setExporting(false);
    }
  }, [image, dimensions, transform, viewport, onCropped]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Adjust your profile picture</DialogTitle>
          <DialogDescription>
            Drag to reposition. Use the slider or scroll to zoom.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none select-none overflow-hidden rounded-full border border-border"
            data-testid="avatar-crop-viewport"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            style={{ width: viewport, height: viewport, cursor: "grab" }}
          >
            {image && (
              <img
                alt=""
                className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
                draggable={false}
                src={image.src}
                style={{
                  width: dimensions ? dimensions.width * transform.scale : 0,
                  height: dimensions ? dimensions.height * transform.scale : 0,
                  transform: `translate(${transform.x}px, ${transform.y}px)`,
                }}
              />
            )}
          </div>
          <div className="flex w-full items-center gap-3">
            <Button
              aria-label="Zoom out"
              onClick={() => zoomBy(1 / 1.2)}
              size="sm"
              variant="outline"
            >
              −
            </Button>
            <input
              aria-label="Zoom"
              className="w-full"
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              onChange={(event) => {
                const scale = Number(event.target.value);
                if (!dimensions || Number.isNaN(scale)) return;
                zoomBy(scale / transform.scale);
              }}
              step={0.01}
              type="range"
              value={transform.scale}
            />
            <Button
              aria-label="Zoom in"
              onClick={() => zoomBy(1.2)}
              size="sm"
              variant="outline"
            >
              +
            </Button>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button
            data-testid="avatar-crop-save"
            disabled={!image || exporting}
            onClick={handleSave}
          >
            {exporting ? "Saving…" : "Save avatar"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
