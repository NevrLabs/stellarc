import { useState, useEffect } from "react";

export type Platform = "desktop" | "mobile";

export function usePlatform(): Platform {
  const buildPlatform = import.meta.env.VITE_PLATFORM as Platform | undefined;

  const [viewport, setViewport] = useState<Platform>(() => {
    if (buildPlatform) return buildPlatform;
    return window.innerWidth >= 768 ? "desktop" : "mobile";
  });

  useEffect(() => {
    if (buildPlatform) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      setViewport(e.matches ? "desktop" : "mobile");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [buildPlatform]);

  return buildPlatform ?? viewport;
}
