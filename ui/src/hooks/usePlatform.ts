import { useState, useEffect, useCallback } from "react";

export type Platform = "desktop" | "mobile";

/**
 * Platform detection. Build-time flag takes priority (Tauri: VITE_PLATFORM).
 * Falls back to viewport width (web: responsive auto-detect).
 *
 * On native builds, VITE_PLATFORM is set at build time so the other
 * variant is dead-code eliminated entirely. On web, both variants are
 * available and the hook reacts to viewport resize.
 */
export function usePlatform(): Platform {
  const buildPlatform = import.meta.env.VITE_PLATFORM as Platform | undefined;

  const [viewport, setViewport] = useState<Platform>(() => {
    if (buildPlatform) return buildPlatform;
    return window.innerWidth >= 768 ? "desktop" : "mobile";
  });

  useEffect(() => {
    if (buildPlatform) return; // fixed at build time, no listener
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = useCallback((e: MediaQueryListEvent) => {
      setViewport(e.matches ? "desktop" : "mobile");
    }, []);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [buildPlatform]);

  return buildPlatform ?? viewport;
}
