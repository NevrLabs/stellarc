import type { Sql } from "postgres";

// STL-18 §3 test-composed server: mounts apps/stellarc-api/src/http.ts
// (foundation: /health + /orgs/:org/v1/shape) plus the repository routes
// under test. Test principal grammar: "Bearer <org> <user>" (test-only,
// mirroring tests/integration/test-server.ts).

export async function startRepositoryTestServer(sql: Sql) {
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const { repositoryHandler } = await import(
		"../../apps/stellarc-api/src/repository-http"
	);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { registerRepositoryShapes } = await import(
		"../../packages/sync/src/repository-shapes"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { Layer, ManagedRuntime } = await import("effect");

	const engine = new ShapeEngine(sql);
	registerRepositoryShapes(engine);
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	// Test principal grammar ("Bearer <org> <user>") — mirrors
	// tests/integration/test-server.ts; production never parses tokens.
	const testPrincipalFrom = (
		org: string,
		authorization: string | undefined,
	): string => {
		const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
		return token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
	};
	const authorize = (
		org: string,
		headers: Readonly<Record<string, string>>,
		principal?: string,
	) => {
		if (!headers.authorization) return "unauthenticated";
		const token = headers.authorization.replace(/^Bearer\s+/i, "").trim();
		return token.startsWith(`${org} `) && (principal ?? "") !== ""
			? "ok"
			: "forbidden";
	};
	const foundation = foundationHandler(
		sql,
		engine,
		authorize,
		undefined,
		telemetry.layer,
		undefined,
		testPrincipalFrom,
	);
	const repository = repositoryHandler(
		sql,
		authorize,
		telemetry.layer,
		undefined,
		testPrincipalFrom,
	);
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: (request) =>
			new URL(request.url).pathname.startsWith("/api/identity/")
				? repository.handler(request)
				: foundation.handler(request),
	});
	return {
		url: server.url.origin,
		telemetry,
		async close() {
			server.stop(true);
			await repository.dispose();
			await foundation.dispose();
			await runtime.dispose();
		},
	};
}
