/*
 * NEVR-498 — dismissed onboarding suggestions, persisted client-side per
 * browser user (localStorage; no backend at this stage). A dismissed
 * suggestion stays dismissed: it never re-promotes, across reloads.
 *
 * The store starts empty (not from localStorage) so the first client render
 * matches the prerendered HTML — same discipline as ThemeSync (see the note
 * in client.tsx): saved state is hydrated after mount via hydrateDismissed().
 */
import { Store } from "@tanstack/store";

const KEY = "stellarc.suggestions.dismissed";

export interface DismissedState {
	/** Suggestion ids the user dismissed. */
	ids: string[];
}

export const dismissedStore = new Store<DismissedState>({ ids: [] });

let hydrated = false;

/** Load saved dismissals into the store (once, after mount). */
export function hydrateDismissed(): void {
	if (hydrated) return;
	hydrated = true;
	try {
		const raw = globalThis.localStorage?.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		if (Array.isArray(parsed)) {
			const ids = parsed.filter((id): id is string => typeof id === "string");
			dismissedStore.setState(() => ({ ids }));
		}
	} catch {
		// Unreadable or unavailable storage — start clean, dismissals this
		// session still work in memory.
	}
}

/** Dismiss a suggestion for good: update the store and persist immediately. */
export function dismissSuggestion(id: string): void {
	dismissedStore.setState((s) =>
		s.ids.includes(id) ? s : { ids: [...s.ids, id] },
	);
	try {
		globalThis.localStorage?.setItem(
			KEY,
			JSON.stringify(dismissedStore.state.ids),
		);
	} catch {
		// Non-persistent context — the in-memory dismissal still holds.
	}
}
