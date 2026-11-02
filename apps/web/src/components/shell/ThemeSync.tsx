import { useStore } from "@tanstack/react-store";
import { useEffect } from "react";

import { applyTheme, themeStore } from "@/state/theme";

/**
 * Syncs <html data-theme> with the theme store after mount. Runs post-hydration
 * on purpose: mutating the attribute before hydrateRoot mismatches the
 * prerendered document and aborts hydration (React #418).
 */
export function ThemeSync() {
	const { theme } = useStore(themeStore);
	useEffect(() => {
		applyTheme(theme);
		// Signals Playwright (and humans' tooling) that listeners are attached.
		document.documentElement.dataset.hydrated = "1";
	}, [theme]);
	return null;
}
