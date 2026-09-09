import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const MIN_WIDTH = 240;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 340;

function storageKey(id: string) {
  return `kaneo:repo-master-detail:${id}`;
}

function readStoredWidth(id: string) {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(storageKey(id));
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed));
}

type RepoMasterDetailProps = {
  /** Distinguishes the persisted width of the issues and pulls panes. */
  id: string;
  list: ReactNode;
  detail: ReactNode;
  /** True when a detail route is active. */
  hasDetail: boolean;
};

/**
 * GitHub-style master-detail shell.
 *
 * Desktop keeps the list as a resizable left rail so the user can switch
 * items quickly. Mobile has no room for two panes, so the detail is a
 * separate page and the list is hidden while it is open.
 */
export default function RepoMasterDetail({
  id,
  list,
  detail,
  hasDetail,
}: RepoMasterDetailProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    setWidth(readStoredWidth(id));
  }, [id]);

  const applyWidth = useCallback((clientX: number) => {
    const left = containerRef.current?.getBoundingClientRect().left ?? 0;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, clientX - left));
    setWidth(next);
    return next;
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      applyWidth(event.clientX);
    };
    const onUp = (event: PointerEvent) => {
      window.localStorage.setItem(
        storageKey(id),
        String(applyWidth(event.clientX)),
      );
      setIsResizing(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Stop the pointer from selecting page text while dragging.
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = "";
    };
  }, [applyWidth, id, isResizing]);

  // Mobile: list and detail are separate pages, never side by side.
  if (isMobile) {
    return <div className="min-h-0">{hasDetail ? detail : list}</div>;
  }

  if (!hasDetail) {
    return <div className="min-h-0">{list}</div>;
  }

  return (
    <div
      className="flex h-full min-h-0 items-stretch overflow-hidden"
      ref={containerRef}
    >
      <section
        className="min-h-0 shrink-0 overflow-y-auto overscroll-contain border-r"
        data-testid="repo-list-viewport"
        style={{ width }}
      >
        {list}
      </section>
      <div
        className="group relative w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 data-[resizing=true]:bg-primary/40"
        data-resizing={isResizing}
        onPointerDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
      >
        {/* Keyboard users retain an accessible range without exposing the
            browser's native slider thumb as a stray white square. */}
        <input
          aria-label="Resize list panel"
          className="sr-only"
          max={MAX_WIDTH}
          min={MIN_WIDTH}
          onChange={(event) => {
            const next = Number(event.target.value);
            setWidth(next);
            window.localStorage.setItem(storageKey(id), String(next));
          }}
          step={8}
          type="range"
          value={width}
        />
      </div>
      <section
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="repo-detail-viewport"
      >
        {detail}
      </section>
    </div>
  );
}
