import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

// Canonical Start client entry (matches the framework default entry): React
// hydrates the whole document; a manual hydrateStart() call deadlocks because
// the router hand-off waits for hydration that only this entry triggers.
// NOTE: do not mutate the document (e.g. data-theme) before hydrateRoot — the
// prerendered attribute must match or React aborts hydration (error #418).
// ThemeSync applies the saved theme right after mount instead.
startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
	);
});
