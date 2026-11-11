/**
 * NEVR-603 — the scope-root audit engine (pure; no imports of the route
 * declarations themselves, so it is trivially unit-testable with synthetic
 * probes). The collectors that turn the real HttpApi groups + MCP registry
 * into descriptors live in tools/scope-audit/run.ts; the CI job
 * (`bun run scope:audit`) fails the build on any finding.
 *
 * Rules (docs/design/scope-roots.md §Audit contract):
 *  R1  every route is declared            — a route without a table row
 *  R2  every row names a real route       — stale rows cannot hide drift
 *  R3  scope root ∈ taxonomy
 *  R4  scope `public` carries no parent
 *  R5  scope org/board/task records its parent resource
 *  R6  parent provenance is structural: `path`/`query`/`payload` must name a
 *      field that actually exists there (line a); `resolved` must record the
 *      resolution path (and the runtime guard must fail closed — denial tests)
 *  R7  identity org-prefix law: any path under `/orgs/:org` is scope `org`
 *  R8  credential routes carry `RateLimited` in their error union (line f)
 *  R9  secret-material field names in success schemas only on
 *      `returnsSecret` routes, i.e. create-time (line g)
 *  R10 cursor-ish request fields must be registered in BOUNDED_CURSORS (line e)
 *  R11 redirect-ish request fields must be registered in REDIRECT_SAFE (line h)
 *  R12 every MCP tool declares a scope root ∈ taxonomy (declared as a
 *      required field of McpToolSpec — the compiler enforces presence, this
 *      validates the value)
 */

import {
	BOUNDED_CURSORS,
	REDIRECT_SAFE,
	type RouteScope,
	SCOPE_ROOTS,
} from "./scope";

// --- descriptors --------------------------------------------------------------------------

export interface RequestFields {
	readonly path: ReadonlyArray<string>;
	readonly query: ReadonlyArray<string>;
	readonly payload: ReadonlyArray<string>;
}

export interface AuditRoute {
	/** Stable route id: "kaneo/boards/list", "identity/create-apikey", "mcp/get_task". */
	readonly id: string;
	readonly kind: "http" | "mcp";
	readonly method: string;
	readonly path: string;
	readonly declared: RouteScope | undefined;
	readonly request: RequestFields;
	/** Every property name reachable in the success schema (nested included). */
	readonly successFields: ReadonlyArray<string>;
	/** JSON of the error schemas (for the RateLimited tag check). */
	readonly errorJson: string;
}

export interface AuditFinding {
	readonly rule: string;
	readonly route: string;
	readonly detail: string;
}

// --- secret-material / cursor / redirect vocabularies (lines e, g, h) ---------------------
// Matched on the lower_snake_case normalisation of a field name, whole words:
// `aiDefaultTokenLimit` is a quota, not a credential; `accessToken` is.

const normalize = (name: string) =>
	name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const SECRET_FIELD =
	/(^|_)(access_token|refresh_token|id_token|api_key|apikey|private_key|secret_key|client_secret)($|_)|(^|_)(secret|password|passphrase|credential|credentials|token|key)$/;
const CURSOR_FIELD =
	/(^|_)(cursor|cursor_id|page_token|next_page|after_cursor|before_cursor|starting_after)($|_)/;
const REDIRECT_FIELD =
	/(^|_)(redirect|redirect_uri|redirect_url|callback|callback_url|next_path|next_url|return_url|continue_url|continue)($|_)/;

const matches = (pattern: RegExp) => (name: string) =>
	pattern.test(normalize(name));

export const isSecretFieldName = matches(SECRET_FIELD);
export const isCursorFieldName = matches(CURSOR_FIELD);
export const isRedirectFieldName = matches(REDIRECT_FIELD);

// --- the engine ---------------------------------------------------------------------------

export function auditRoutes(
	routes: ReadonlyArray<AuditRoute>,
	options?: {
		boundedCursors?: ReadonlySet<string>;
		redirectSafe?: ReadonlySet<string>;
	},
): AuditFinding[] {
	const cursors = options?.boundedCursors ?? BOUNDED_CURSORS;
	const redirects = options?.redirectSafe ?? REDIRECT_SAFE;
	const findings: AuditFinding[] = [];
	const seen = new Set<string>();
	const fail = (rule: string, route: string, detail: string) =>
		findings.push({ rule, route, detail });

	for (const route of routes) {
		seen.add(route.id);
		const scope = route.declared;

		if (scope === undefined) {
			fail("R1", route.id, "no scope root declared for this route");
			continue;
		}
		if (!SCOPE_ROOTS.includes(scope.scope)) {
			fail(
				"R3",
				route.id,
				`scope root "${scope.scope}" is not in the taxonomy`,
			);
			continue;
		}

		// R4 — public routes carry no parent and name no resource in the path.
		if (scope.scope === "public" && scope.parent !== undefined)
			fail("R4", route.id, "public route must not record a parent resource");

		// R5 — org/board/task roots record where the parent comes from.
		if (
			(scope.scope === "org" ||
				scope.scope === "board" ||
				scope.scope === "task") &&
			scope.parent === undefined
		)
			fail(
				"R5",
				route.id,
				`scope "${scope.scope}" requires a parent resource (path/query/payload provenance or the resolved path)`,
			);

		// R6 — provenance is structural, not aspirational.
		const parent = scope.parent;
		if (parent) {
			const param = parent.param ?? "";
			if (parent.from === "path" && !route.request.path.includes(param))
				fail(
					"R6",
					route.id,
					`parent ${parent.resource} claims path param "${param}", but the path has [${route.request.path.join(", ")}]`,
				);
			if (parent.from === "query" && !route.request.query.includes(param))
				fail(
					"R6",
					route.id,
					`parent ${parent.resource} claims query field "${param}", but the query schema has [${route.request.query.join(", ")}]`,
				);
			if (parent.from === "payload" && !route.request.payload.includes(param))
				fail(
					"R6",
					route.id,
					`parent ${parent.resource} claims payload field "${param}", but the payload schema has [${route.request.payload.join(", ")}]`,
				);
			if (parent.from === "resolved" && !(parent.note ?? "").trim())
				fail(
					"R6",
					route.id,
					`parent ${parent.resource} is resolved indirectly — the resolution path must be recorded`,
				);
		}

		// R7 — the identity org-prefix law.
		if (/\/orgs\/:org(\/|$)/.test(route.path) && scope.scope !== "org")
			fail(
				"R7",
				route.id,
				`path is nested under /orgs/:org but the declared scope is "${scope.scope}", not "org"`,
			);

		// R8 — credential surfaces must be able to answer RateLimited.
		if (scope.credential && !route.errorJson.includes("RateLimited"))
			fail(
				"R8",
				route.id,
				"credential route (line f) must carry RateLimited in its error union",
			);

		// R9 — secret material only at create time, never on reads.
		if (!scope.returnsSecret)
			for (const field of route.successFields)
				if (isSecretFieldName(field)) {
					fail(
						"R9",
						route.id,
						`success schema carries secret-material field "${field}" (line g: create-time only, flagged returnsSecret)`,
					);
					break;
				}

		// R10/R11 — cursor and redirect discipline over request fields.
		for (const source of ["path", "query", "payload"] as const)
			for (const field of route.request[source]) {
				if (isCursorFieldName(field) && !cursors.has(field))
					fail(
						"R10",
						route.id,
						`request field "${field}" looks like a pagination cursor but is not registered in BOUNDED_CURSORS (line e: validate + bound it, or rename)`,
					);
				if (isRedirectFieldName(field) && !redirects.has(field))
					fail(
						"R11",
						route.id,
						`request field "${field}" looks like a redirect/callback target but is not registered in REDIRECT_SAFE (line h: reject authority-relative paths)`,
					);
			}
	}

	return findings;
}

/** Rows in a table that no longer match a route (R2). */
export function staleRows(
	routes: ReadonlyArray<AuditRoute>,
	declaredIds: ReadonlyArray<string>,
): AuditFinding[] {
	const live = new Set(routes.map((r) => r.id));
	return declaredIds
		.filter((id) => !live.has(id))
		.map((id) => ({
			rule: "R2",
			route: id,
			detail: "scope-root row names a route that does not exist (stale entry)",
		}));
}
