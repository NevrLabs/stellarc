import { useStore } from "@tanstack/react-store";
import { useGo } from "@/components/shell/nav";
import { Ico } from "@/components/ui/icon";
import type { ViewId } from "@/fixtures/data";
import { hasFlag } from "@/lib/flags";
import { themeStore, toggleTheme } from "@/state/theme";

export function Rail({ activeView }: { activeView: ViewId }) {
	const go = useGo();
	const { theme } = useStore(themeStore);

	return (
		<nav className="rail" aria-label="Views">
			<button
				type="button"
				className={`v ${activeView === "home" ? "on" : ""}`}
				data-testid="rail-home"
				aria-label="Home"
				onClick={() => go({ view: "home", item: "inbox" })}
			>
				<Ico n="inbox" />
				<span className="tip">Home</span>
			</button>
			<button
				type="button"
				className={`v ${activeView === "resources" ? "on" : ""}`}
				data-testid="rail-resources"
				aria-label="Resources"
				onClick={() => go({ view: "resources", item: "board-eng" })}
			>
				<Ico n="layers" />
				<span className="tip">Resources</span>
			</button>
			{hasFlag("agents") && (
				<button
					type="button"
					className={`v ${activeView === "agents" ? "on" : ""}`}
					data-testid="rail-agents"
					aria-label="Agents"
					onClick={() => go({ view: "agents", item: "s-229" })}
				>
					<Ico n="bot" />
					<span className="dot" />
					<span className="tip">Agents</span>
				</button>
			)}
			<span className="sep" />
			<span className="grow" />
			<button
				type="button"
				className="v"
				data-testid="theme-toggle"
				aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
				onClick={toggleTheme}
			>
				<Ico n={theme === "dark" ? "sun" : "moon"} />
				<span className="tip">
					{theme === "dark" ? "Light mode" : "Dark mode"}
				</span>
			</button>
			<button type="button" className="v" aria-label="Settings">
				<Ico n="settings" />
				<span className="tip">Settings</span>
			</button>
		</nav>
	);
}
