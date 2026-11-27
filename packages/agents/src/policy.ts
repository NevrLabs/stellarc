import type { PermissionPolicy } from "./protocol";

/** Canonical permission-policy semantics (NEVR-198, NEVR-701): the glob
 * grammar lives HERE so the node's per-request evaluation and the plane's
 * registration-time validation can never drift apart. Both sides import this
 * module; nothing re-implements a matcher locally. */

/** Glob-style tool-pattern match. `*` spans within a dot-separated segment
 * (`mcp:github.list_*`), `?` one char; no cross-segment wildcard — an
 * allowlist entry names the tool it allows, not a prefix. */
export function toolMatches(pattern: string, tool: string): boolean {
	const re = new RegExp(
		`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? "[^.]*" : c === "?" ? "[^.]" : `\\${c}`))}$`,
	);
	return re.test(tool);
}

// ── glob ∩ glob (registration-time conflict check, NEVR-701) ────────────────

type Token = "literal" | "star" | "one";
const token = (c: string | undefined): Token =>
	c === "*" ? "star" : c === "?" ? "one" : "literal";

/** Can one tool name match BOTH patterns? Exact, not string equality:
 * `mcp:github.*` intersects `mcp:github.create_*` (both match
 * `mcp:github.create_issue`), while `deploy` and `destroy` stay disjoint.
 *
 * Product reachability over (i, j): state (i, j) means the prefixes
 * a[..i) and b[..j) can both be prefixes of one common string. Transitions
 * consume ONE common character (a `*` token self-loops on non-dot chars —
 * it may span several of the other pattern's tokens), plus epsilon moves
 * where a `*` matches zero characters. Both patterns are capped at 256
 * chars by the schema, so the state space is bounded and each state is
 * visited at most once. */
export function toolGlobsIntersect(a: string, b: string): boolean {
	const n = a.length;
	const m = b.length;
	const seen = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
	const stack: Array<[number, number]> = [[0, 0]];
	while (stack.length > 0) {
		const [i, j] = stack.pop() as [number, number];
		if (i === n && j === m) return true;
		if (seen[i][j]) continue;
		seen[i][j] = 1;
		const ta = token(a[i]);
		const tb = token(b[j]);
		// Epsilon: a `*` matching zero characters advances its own side only.
		if (ta === "star" && i < n) stack.push([i + 1, j]);
		if (tb === "star" && j < m) stack.push([i, j + 1]);
		if (i >= n || j >= m) continue;
		const ca = a[i];
		const cb = b[j];
		// Consume one common character c. A literal forces c; `?`/`*` force
		// c ≠ '.', and a `*` stays put while the other side advances.
		if (ta === "literal" && tb === "literal") {
			if (ca === cb) stack.push([i + 1, j + 1]);
		} else if (ta === "literal" && tb === "one") {
			if (ca !== ".") stack.push([i + 1, j + 1]);
		} else if (ta === "literal" && tb === "star") {
			if (ca !== ".") stack.push([i + 1, j]);
		} else if (ta === "one" && tb === "literal") {
			if (cb !== ".") stack.push([i + 1, j + 1]);
		} else if (ta === "one" && tb === "one") {
			stack.push([i + 1, j + 1]);
		} else if (ta === "one" && tb === "star") {
			stack.push([i + 1, j]);
		} else if (ta === "star" && tb === "literal") {
			if (cb !== ".") stack.push([i, j + 1]);
		} else if (ta === "star" && tb === "one") {
			stack.push([i, j + 1]);
		}
		// star vs star consuming one char is a no-progress self-loop: the
		// epsilon moves above already cover everything it could reach.
	}
	return false;
}

/** First ask/autoAllow pattern pair that can match one common tool, if any
 * (deterministic: ask patterns outer, autoAllow inner, both in list order). */
export function policyOverlap(
	policy: PermissionPolicy,
): { ask: string; autoAllow: string } | null {
	for (const ask of policy.ask) {
		for (const auto of policy.autoAllow) {
			if (toolGlobsIntersect(ask, auto)) return { ask, autoAllow: auto };
		}
	}
	return null;
}

// ── per-request evaluation (the node side) ──────────────────────────────────

/** How a permission request resolves against the agent's policy:
 * - `ask` — the tool matches an `ask` glob: parks for a human verdict,
 *   unconditionally.
 * - `auto` — the null-policy legacy (everything allowed) or an `autoAllow`
 *   glob match: the node may answer without a human.
 * - `park` — a non-null policy that does not allowlist the tool.
 *
 * Evaluation order is ask > autoAllow > null-legacy (NEVR-701, after Paseo
 * #9927): an explicit ask requirement survives every broad auto-accept
 * default — a tool matching both `ask` and `autoAllow` parks, never
 * auto-answers. Pure per-request classification; config errors (an
 * ask/autoAllow overlap) are rejected at registration instead. */
export type PermissionClass = "ask" | "auto" | "park";

export function classifyPermission(
	policy: PermissionPolicy | null | undefined,
	toolName: string | null,
): PermissionClass {
	// `ask` is checked FIRST and unconditionally — before the null-policy
	// legacy allow-all. (Stored rows pre-dating the ask class decode without
	// the key via the store's cast, hence the lenient access.)
	const ask = policy?.ask ?? [];
	if (toolName && ask.some((p) => toolMatches(p, toolName))) return "ask";
	if (!policy) return "auto"; // legacy: null policy allows everything
	if (!toolName) return "park"; // untitled tool: no glob can name it
	return policy.autoAllow.some((p) => toolMatches(p, toolName))
		? "auto"
		: "park";
}
