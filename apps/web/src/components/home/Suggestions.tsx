import { useStore } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { useGo } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { Ico } from "@/components/ui/icon";
import { useSuggestions } from "@/data/queries";
import type { Suggestion } from "@/data/suggestions";
import {
	dismissedStore,
	dismissSuggestion,
	hydrateDismissed,
} from "@/state/suggestions";

/**
 * NEVR-498 — onboarding suggestions on home/first-run, derived from the
 * activity this instance already recorded (see data/suggestions.ts). Renders
 * only after mount: the derivation reads the clock and the dismissal list
 * lives in localStorage, so gating the first paint keeps hydration clean —
 * the same discipline ThemeSync applies (client.tsx note).
 *
 * - Recorded activity → every suggestion names its evidence and is one
 *   action ("Open") away from use.
 * - Zero recorded activity → the honest empty state, silently, no demo
 *   content.
 * - All suggestions dismissed → nothing (dismissed never re-promotes; the
 *   honest "nothing here yet" line is reserved for zero activity, not for
 *   choices the user made).
 */
export function Suggestions() {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		hydrateDismissed();
		setReady(true);
	}, []);

	const suggestions = useSuggestions();
	const { ids } = useStore(dismissedStore);

	if (!ready) return null;

	if (suggestions.length === 0) {
		return (
			<div className="sug-empty" data-testid="suggestions-empty">
				Nothing here yet. Suggestions appear as tasks are recorded.
			</div>
		);
	}

	const live = suggestions.filter((s) => !ids.includes(s.id));
	if (live.length === 0) return null;

	return (
		<section className="sug" data-testid="suggestions">
			<div className="sug-h">
				<Ico n="circle-dot" sm />
				<span>Suggested for you</span>
			</div>
			{live.map((s) => (
				<SuggestionCard key={s.id} s={s} />
			))}
		</section>
	);
}

function SuggestionCard({ s }: { s: Suggestion }) {
	const go = useGo();
	return (
		<div className="sug-card" data-testid="suggestion" data-suggestion={s.id}>
			<span className="sug-ic">
				<Ico n="folder-kanban" />
			</span>
			<span className="sug-t">
				<b>{s.label}</b>
				<span className="sug-ev" data-testid="suggestion-evidence">
					{s.evidence}
				</span>
			</span>
			<span className="sug-a">
				<Button
					variant="primary"
					size="sm"
					data-testid="suggestion-open"
					onClick={() => go(s.ref)}
				>
					Open
				</Button>
				<button
					type="button"
					className="sug-x"
					data-testid="suggestion-dismiss"
					aria-label={`Dismiss ${s.label}`}
					title="Dismiss"
					onClick={() => dismissSuggestion(s.id)}
				>
					<Ico n="x" sm />
				</button>
			</span>
		</div>
	);
}
