/**
 * NEVR-603 — object-scope roots, pinned per route (Plane v1.5.0-rc1 pattern).
 *
 * Every HttpApi endpoint declares the scope root its authorization decision
 * hangs off (org / board / task / user-self / public), the parent resource a
 * nested route derives that root from, and the flags the CI audit enforces
 * (docs/design/scope-roots.md is the prose; these tables are the law the
 * audit reads). Tables are `satisfies`-checked against the endpoint
 * identifier union of their group, so a new endpoint without a declared
 * scope root fails `tsc` here and fails `bun run scope:audit` in CI — the
 * accumulation Plane had to purge in one 30+-fix sweep cannot start.
 *
 * Legacy fallthrough note: anything under `/api/*` that is NOT one of these
 * endpoints is served by the lifted kaneo-legacy tree (kaneo/src/http.ts
 * `isNative`), whose authorization lives in that tree's middlewares. The
 * strangler contract is: a route migrates to the native surface only by
 * landing here with a declared scope root.
 */

import type { FoundationApi } from "./api";
import type { IdentityApiGroup } from "./identity/http";

// --- taxonomy (ours; not Plane's org/project/issue) -------------------------------------

export const SCOPE_ROOTS = [
	"org",
	"board",
	"task",
	"user-self",
	"public",
] as const;
export type ScopeRoot = (typeof SCOPE_ROOTS)[number];

/** Resources a nested route can derive its scope root from. */
export type ParentResource =
	| "org"
	| "board"
	| "column"
	| "task"
	| "comment"
	| "label"
	| "team"
	| "team-member"
	| "member"
	| "role"
	| "invitation"
	| "api-key"
	| "avatar"
	| "user"
	| "repo"
	| "principal";

/**
 * Where the parent (and therefore the scope root) comes from.
 * - `path`/`query`/`payload`: the named field carries the parent id
 *   (line a: prefer `path`; `query`/`payload` exist only for Kaneo wire
 *   compatibility and are recorded so the audit can flag new ones).
 * - `resolved`: ownership is resolved indirectly (id → row → parent); the
 *   note records the resolution path, and the runtime guard must fail
 *   closed when the id resolves to nothing.
 */
export interface ParentRef {
	readonly resource: ParentResource;
	readonly from: "path" | "query" | "payload" | "resolved";
	readonly param?: string;
	readonly note?: string;
}

export interface RouteScope {
	readonly scope: ScopeRoot;
	readonly parent?: ParentRef;
	/**
	 * Credential surface (acceptance line f): the route must be
	 * rate-limited and its error union must carry `RateLimited`.
	 */
	readonly credential?: boolean;
	/**
	 * The ONLY way a success schema may carry secret material (line g):
	 * plaintext at create time, never on reads.
	 */
	readonly returnsSecret?: boolean;
	readonly note?: string;
}

// --- foundation (2) -----------------------------------------------------------------------

export const foundationScopeRoots = {
	health: {
		scope: "public",
		note: "Liveness probe; no principal, no org context.",
	},
	shape: {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		note: "Sync shape of one org; the host injects the authorize() decision.",
	},
} satisfies Record<
	keyof typeof FoundationApi.groups.foundation.endpoints,
	RouteScope
>;

// --- identity (26) ------------------------------------------------------------------------
// Handlers do not exist yet (contract-only, NEVR-198); these declarations are
// the acceptance lines the first handler PR inherits, and the audit holds the
// line meanwhile.

export const identityScopeRoots = {
	"active-org": {
		scope: "user-self",
		note: "Switches the caller's own active org; membership required.",
	},
	"list-organizations": {
		scope: "user-self",
		note: "Line c: only orgs the caller's principal can read.",
	},
	"create-organization": {
		scope: "user-self",
		note: "Created under the caller; no org parent to derive.",
	},
	"update-organization": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"list-members": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		note: "Line c: rows of this org only.",
	},
	"update-member": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		note: "Member :id nested under the :org path parent (line a).",
	},
	"delete-member": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"list-roles": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"create-role": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"update-role": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"delete-role": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"list-teams": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"create-team": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"update-team": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"delete-team": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"list-team-members": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		note: "Team :id rides the same path, under the :org parent.",
	},
	"add-team-member": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"delete-team-member": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"list-invitations": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"create-invitation": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		credential: true,
		note: "Line f: invitation create is a credential-adjacent surface.",
	},
	"cancel-invitation": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"accept-invitation": {
		scope: "user-self",
		parent: {
			resource: "invitation",
			from: "path",
			param: "id",
		},
		note: "Accepter acts on their own behalf; org resolved from the invitation.",
		credential: true,
	},
	"list-apikeys": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		note: "Line g: ApiKeyPublic carries prefix only, never plaintext.",
	},
	"create-apikey": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
		credential: true,
		returnsSecret: true,
		note: "Line g: plaintext key returned at create only, never on reads.",
	},
	"delete-apikey": {
		scope: "org",
		parent: { resource: "org", from: "path", param: "org" },
	},
	"user-avatar": {
		scope: "user-self",
		parent: { resource: "user", from: "path", param: "id" },
		note: "Avatar bytes of the path user; own avatar or permitted profile.",
	},
} satisfies Record<keyof typeof IdentityApiGroup.endpoints, RouteScope>;

// --- discipline allowlists (lines e and h) ------------------------------------------------
// Empty on purpose. The audit rejects any cursor-ish or redirect-ish request
// field that is not registered here, so the FIRST paginated route / webhook
// callback PR has to declare its bounds (line e) or its safe-redirect rule
// (line h) instead of silently starting the next accumulation.

/** Field names accepted as bounded, validated pagination cursors (line e). */
export const BOUNDED_CURSORS: ReadonlySet<string> = new Set([]);

/** Field names accepted as redirect/callback targets (line h). */
export const REDIRECT_SAFE: ReadonlySet<string> = new Set([]);
