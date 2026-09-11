import { useEffect } from "react";
import { useUserPreferencesStore } from "@/store/user-preferences";

/** Root class that disables the backdrop blur behind overlays (#125). */
export const REDUCE_OVERLAY_BLUR_CLASS = "reduce-overlay-blur";

export function useUserPreferencesEffects() {
  const { compactMode, reduceOverlayBlur } = useUserPreferencesStore();

  useEffect(() => {
    const root = document.documentElement;

    if (compactMode) {
      root.classList.add("compact-mode");
    } else {
      root.classList.remove("compact-mode");
    }

    return () => {
      root.classList.remove("compact-mode");
    };
  }, [compactMode]);

  /**
   * #125: toggled on the root rather than threaded through every overlay, so
   * dialogs, sheets, alert dialogs and the command palette all follow one
   * preference without each primitive needing to read the store.
   */
  useEffect(() => {
    const root = document.documentElement;

    if (reduceOverlayBlur) {
      root.classList.add(REDUCE_OVERLAY_BLUR_CLASS);
    } else {
      root.classList.remove(REDUCE_OVERLAY_BLUR_CLASS);
    }

    return () => {
      root.classList.remove(REDUCE_OVERLAY_BLUR_CLASS);
    };
  }, [reduceOverlayBlur]);

  return {
    compactMode,
    reduceOverlayBlur,
  };
}
