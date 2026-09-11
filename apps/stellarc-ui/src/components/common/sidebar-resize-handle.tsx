import { useCallback, useEffect, useRef, useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/cn";
import {
  clampSidebarWidth,
  parseStoredSidebarWidth,
  sidebarWidthFromPointer,
} from "@/lib/sidebar-width";
import { useUserPreferencesStore } from "@/store/user-preferences";

/**
 * Drag handle on the sidebar's right edge + the width plumbing.
 *
 * Returns the style consumers spread onto SidebarProvider: the whole sidebar
 * system (gap element, fixed container, inset margin) is driven by the
 * --sidebar-width variable, so overriding that one variable resizes every
 * dependent element consistently — no per-element width state.
 *
 * Width rules live in lib/sidebar-width (pure, unit-tested): clamp to
 * [192px, min(480px, 40vw)], parse storage defensively, re-clamp persisted
 * widths against the CURRENT viewport.
 */
export function useSidebarWidth() {
  const sidebarWidth = useUserPreferencesStore((s) => s.sidebarWidth);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);

  // Hydration guard: render the CSS default until the client viewport is
  // known, so the first paint cannot clobber (or flash) the saved width.
  useEffect(() => {
    setViewportWidth(window.innerWidth);
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (sidebarWidth === null || viewportWidth === null) {
    return undefined;
  }
  return `${parseStoredSidebarWidth(sidebarWidth, viewportWidth)}px`;
}

export function SidebarResizeHandle() {
  const { state, isMobile } = useSidebar();
  const setSidebarWidth = useUserPreferencesStore((s) => s.setSidebarWidth);
  const [dragging, setDragging] = useState(false);
  // Live width during the drag; persisted only on pointer-up.
  const liveWidthRef = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(true);
      const provider = (event.target as HTMLElement).closest(
        '[data-slot="sidebar-wrapper"]',
      ) as HTMLElement | null;
      /*
        Kill the width transitions for the duration of the drag: the sidebar
        container animates width changes (wanted for collapse/expand), which
        makes live dragging rubber-band behind the pointer.
      */
      provider?.setAttribute("data-sidebar-resizing", "true");

      const onMove = (move: PointerEvent) => {
        const width = sidebarWidthFromPointer(move.clientX, window.innerWidth);
        liveWidthRef.current = width;
        // Direct variable write during the drag: a React state update per
        // pointermove re-renders the whole layout tree at 60hz.
        provider?.style.setProperty("--sidebar-width", `${width}px`);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        provider?.removeAttribute("data-sidebar-resizing");
        setDragging(false);
        if (liveWidthRef.current !== null) {
          setSidebarWidth(
            clampSidebarWidth(liveWidthRef.current, window.innerWidth),
          );
          liveWidthRef.current = null;
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setSidebarWidth],
  );

  // No resize affordance on mobile (sheet) or when collapsed to icons.
  if (isMobile || state === "collapsed") return null;

  return (
    <button
      aria-label="Resize sidebar"
      className={cn(
        "absolute inset-y-0 right-0 z-20 hidden w-1.5 cursor-col-resize appearance-none border-0 bg-transparent p-0 md:block",
        "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-transparent after:transition-colors",
        "hover:after:bg-sidebar-border focus-visible:outline-none focus-visible:after:bg-primary/60",
        dragging && "after:bg-primary/50",
      )}
      data-testid="sidebar-resize-handle"
      onDoubleClick={() => setSidebarWidth(null)}
      onKeyDown={(event) => {
        // Keyboard resize: the handle is a real button, so arrow keys work
        // for anyone who cannot drag.
        const step = event.shiftKey ? 64 : 16;
        const current =
          document
            .querySelector('[data-slot="sidebar-container"]')
            ?.getBoundingClientRect().width ?? 240;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? step : -step;
          setSidebarWidth(
            clampSidebarWidth(current + delta, window.innerWidth),
          );
        }
      }}
      onPointerDown={onPointerDown}
      title="Drag to resize · double-click to reset"
      type="button"
    />
  );
}
