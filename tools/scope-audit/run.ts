/**
 * NEVR-603 — scope-root audit, collector + CLI. Reads the REAL route
 * declarations (HttpApi groups, MCP registry) and the scope-root tables,
 * feeds descriptors to the pure engine (packages/contracts/src/scope-audit),
 * and fails (exit 1) on any finding. Zero-finding baseline, blocking in CI
 * from day one — the knip-gate pattern (NEVR-586) applied to authorization.
 *
 *   bun run scope:audit
 */

import { Schema } from "effect";
import { FoundationApi } from "../../packages/contracts/src/api";
import { IdentityApiGroup } from "../../packages/contracts/src/identity/http";
import {
	BOUNDED_CURSORS,
	foundationScopeRoots,
	identityScopeRoots,
	REDIRECT_SAFE,
	type RouteScope,
} from "../../packages/contracts/src/scope";
import {
	type AuditRoute,
	auditRoutes,
	staleRows,
} from "../../packages/contracts/src/scope-audit";
import { KaneoApi } from "../../packages/kaneo/src/api";
import { mcpGuardsLive } from "../../packages/kaneo/src/mcp/guards";
import { mcpTools } from "../../packages/kaneo/src/mcp/tools";
import { kaneoScopeRoots } from "../../packages/kaneo/src/scope";

// --- schema walking ------------------------------------------------------------------------

/** Every property name reachable in a JSON Schema document ($defs included,
 * def names excluded — those are type names, not fields). */
function propertyNames(
	node: unknown,
	out: Set<string> = new Set(),
): Set<string> {
	if (Array.isArray(node)) {
		for (const child of node) propertyNames(child, out);
		return out;
	}
	if (node === null || typeof node !== "object") return out;
	const obj = node as Record<string, unknown>;
	const properties = obj.properties;
	if (properties !== null && typeof properties === "object")
		for (const [name, value] of Object.entries(
			properties as Record<string, unknown>,
		)) {
			out.add(name);
			propertyNames(value, out);
		}
	for (const key of ["anyOf", "allOf", "oneOf", "items", "$defs", "schema"]) {
		const child = obj[key];
		if (child !== undefined) propertyNames(child, out);
	}
	return out;
}

const documentOf = (schema: unknown): unknown => {
	try {
		return Schema.toJsonSchemaDocument(schema as never, {
			onExcessProperty: "ignore",
		});
	} catch {
		return {};
	}
};

const fieldsOf = (schema: unknown): string[] => [
	...propertyNames(documentOf(schema)),
];

interface EndpointLike {
	readonly identifier: string;
	readonly method: string;
	readonly path: string;
	readonly params?: unknown;
	readonly query?: unknown;
	readonly payload: unknown;
	readonly success: unknown;
	readonly error: unknown;
}

const httpRoute = (
	id: string,
	endpoint: EndpointLike,
	declared: RouteScope | undefined,
): AuditRoute => {
	const payloadFields: string[] = [];
	// PayloadMap: ReadonlyMap<contentType, { encoding, schemas: [Schema, ...] }>
	const payload = endpoint.payload as
		| ReadonlyMap<string, { schemas?: ReadonlyArray<unknown> }>
		| undefined;
	if (payload !== undefined && typeof payload.forEach === "function")
		for (const entry of payload.values())
			for (const schema of entry.schemas ?? [])
				payloadFields.push(...fieldsOf(schema));
	const successFields = new Set<string>();
	for (const schema of endpoint.success as Iterable<unknown>)
		for (const name of fieldsOf(schema)) successFields.add(name);
	let errorJson = "";
	for (const schema of endpoint.error as Iterable<unknown>)
		errorJson += JSON.stringify(documentOf(schema));
	return {
		id,
		kind: "http",
		method: endpoint.method,
		path: endpoint.path,
		declared,
		request: {
			path: [...endpoint.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(
				(m) => m[1],
			),
			query: endpoint.query === undefined ? [] : fieldsOf(endpoint.query),
			payload: payloadFields,
		},
		successFields: [...successFields],
		errorJson,
	};
};

const groupRoutes = (
	prefix: string,
	group: { endpoints: Record<string, EndpointLike> },
	table: Record<string, RouteScope>,
): AuditRoute[] =>
	Object.entries(group.endpoints).map(([name, endpoint]) =>
		httpRoute(`${prefix}/${name}`, endpoint, table[name]),
	);

// --- collection ---------------------------------------------------------------------------

export function collectRoutes(): AuditRoute[] {
	const http: AuditRoute[] = [
		...groupRoutes(
			"foundation",
			FoundationApi.groups.foundation as unknown as {
				endpoints: Record<string, EndpointLike>;
			},
			foundationScopeRoots,
		),
		...groupRoutes(
			"identity",
			IdentityApiGroup as unknown as {
				endpoints: Record<string, EndpointLike>;
			},
			identityScopeRoots,
		),
	];
	for (const [name, group] of Object.entries(KaneoApi.groups))
		http.push(
			...groupRoutes(
				`kaneo/${name}`,
				group as unknown as { endpoints: Record<string, EndpointLike> },
				(kaneoScopeRoots as Record<string, Record<string, RouteScope>>)[name],
			),
		);

	// MCP: scope is a required field of McpToolSpec (compiler-enforced
	// presence); the audit validates the value. Tool RESULTS are free-form
	// proxy payloads (no declared result schema), so line g for MCP is the
	// HTTP surface's own response schemas — noted in docs/design/scope-roots.md.
	const tools = mcpTools(mcpGuardsLive(), "http://scope-audit.invalid");
	const mcp: AuditRoute[] = tools.map((tool) => ({
		id: `mcp/${tool.name}`,
		kind: "mcp",
		method: "TOOLS/CALL",
		path: "/api/mcp",
		declared: {
			scope: tool.scope,
			...(tool.parent ? { parent: tool.parent } : {}),
		},
		request: {
			path: [],
			query: [],
			payload: [...propertyNames(tool.jsonSchema as unknown)],
		},
		successFields: [],
		errorJson: "",
	}));
	return [...http, ...mcp];
}

const declaredIds = (_routes: ReadonlyArray<AuditRoute>): string[] => {
	const ids: string[] = [];
	const walk = (prefix: string, table: Record<string, RouteScope>) => {
		for (const name of Object.keys(table)) ids.push(`${prefix}/${name}`);
	};
	walk("foundation", foundationScopeRoots as Record<string, RouteScope>);
	walk("identity", identityScopeRoots as Record<string, RouteScope>);
	for (const name of Object.keys(kaneoScopeRoots))
		walk(
			`kaneo/${name}`,
			(kaneoScopeRoots as Record<string, Record<string, RouteScope>>)[name],
		);
	return ids;
};

export function runAudit(): {
	findings: ReturnType<typeof auditRoutes>;
	http: number;
	mcp: number;
} {
	const routes = collectRoutes();
	const findings = [
		...auditRoutes(routes, {
			boundedCursors: BOUNDED_CURSORS,
			redirectSafe: REDIRECT_SAFE,
		}),
		...staleRows(routes, declaredIds(routes)),
	];
	return {
		findings,
		http: routes.filter((r) => r.kind === "http").length,
		mcp: routes.filter((r) => r.kind === "mcp").length,
	};
}

// --- CLI -----------------------------------------------------------------------------------

if (import.meta.main) {
	const { findings, http, mcp } = runAudit();
	if (findings.length > 0) {
		console.error(
			`scope-audit: ${findings.length} finding(s) across ${http} HttpApi endpoints + ${mcp} MCP tools:\n`,
		);
		for (const finding of findings)
			console.error(
				`  [${finding.rule}] ${finding.route}\n      ${finding.detail}\n`,
			);
		console.error(
			"Every route needs a declared scope root — see docs/design/scope-roots.md and packages/contracts/src/scope.ts.",
		);
		process.exit(1);
	}
	console.log(
		`scope-audit: clean — ${http} HttpApi endpoints + ${mcp} MCP tools, every route carries a declared scope root.`,
	);
}
