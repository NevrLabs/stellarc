import { Store } from "@tanstack/store";

export type Theme = "dark" | "light";

const THEME_KEY = "stellarc.theme";

function initialTheme(): Theme {
	try {
		const saved = globalThis.localStorage?.getItem(THEME_KEY);
		if (saved === "dark" || saved === "light") return saved;
	} catch {
		// localStorage unavailable — default below.
	}
	return "dark";
}

export const themeStore = new Store<{ theme: Theme }>({
	theme: initialTheme(),
});

/** Apply the current theme to <html data-theme> and persist it. */
export function applyTheme(theme: Theme) {
	const root = globalThis.document?.documentElement;
	if (root) root.dataset.theme = theme;
	try {
		globalThis.localStorage?.setItem(THEME_KEY, theme);
	} catch {
		// Non-persistent context — the in-memory store still flips the UI.
	}
}

export function toggleTheme() {
	const next: Theme = themeStore.state.theme === "dark" ? "light" : "dark";
	themeStore.setState((s) => ({ ...s, theme: next }));
	applyTheme(next);
}
