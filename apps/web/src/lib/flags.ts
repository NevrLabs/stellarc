/*
 * Feature flags. An env default (VITE_FEATURE_AGENTS) can flip a flag at build
 * time; localStorage ("stellarc.flags.agents") flips it at runtime for testing
 * and dogfooding. Flags are read once at startup.
 */
export type Flag = "agents";

const envFlags: Record<Flag, boolean> = {
	agents: import.meta.env.VITE_FEATURE_AGENTS === "1",
};

function readLocalStorage(flag: Flag): boolean {
	try {
		return globalThis.localStorage?.getItem(`stellarc.flags.${flag}`) === "1";
	} catch {
		return false;
	}
}

const flags: Record<Flag, boolean> = {
	agents: envFlags.agents || readLocalStorage("agents"),
};

export function hasFlag(flag: Flag): boolean {
	return flags[flag];
}
