/**
 * STL-16 §5/§7: real-API e2e server for work.spec.ts.
 *
 * §6 pixel criterion: built UI served over the REAL API on an isolated
 * disposable Postgres — no route interception of work requests (that would
 * invalidate the evidence). Composes the exact production handlers
 * (workHandler + foundationHandler) the same way apps/stellarc-api/src/main.ts
 * does; the injected authorize implements T1's membership rule over the
 * committed organization_member rows (AuthzLive is the T1 stub that rejects
 * everything). Test-principal extraction ("Bearer <org> <id>") rides the same
 * grammar main.ts's workPrincipalFrom implements.
 *
 * Runs under Bun (imported by the Playwright globalSetup). In-process
 * Playwright probes compose these handlers directly — Node is not involved.
 */
import { createServer } from "node:http";
import type { Sql } from "postgres";
import { ShapeEngine } from "../../../../packages/sync/src/index";
import {
	foundationHandler,
	type Authorize,
} from "../../../../apps/stellarc-api/src/http";
import { workHandler } from "../../../../apps/stellarc-api/src/work-http";

export type E2eServer = {
	port: number;
	close: () => Promise<void>;
};

export async function startWorkE2eServer(
	sql: Sql,
	principals: { org: string; userIds: string[] },
	port = 0,
): Promise<E2eServer> {
	const memberOf = new Set(
		principals.userIds.map((id) => `${principals.org}:${id}`),
	);
	// T1 authorization: session principal must be a member of the org. The UI
	// sends "Bearer <org> <principal>"; foreign principals ≡ unauthenticated.
	const authorize: Authorize = (org, headers, principal) => {
		const token = (headers.authorization ?? "")
			.replace(/^Bearer\s+/i, "")
			.trim();
		const id = token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
		const who = principal ?? id;
		if (!who) return "unauthenticated";
		return memberOf.has(`${org}:${who}`) ? "ok" : "forbidden";
	};
	const principalFrom = (org: string, authorization?: string): string => {
		const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
		return token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
	};
	const http = foundationHandler(
		sql,
		new ShapeEngine(sql),
		authorize,
		undefined,
		undefined,
		undefined,
		principalFrom,
	);
	const work = workHandler(sql, authorize, principalFrom);
	const server = createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? "/", "http://x");
			const pathname = url.pathname;
			const method = request.method ?? "GET";
			const headers: Record<string, string> = {};
			for (const [key, value] of Object.entries(request.headers)) {
				headers[key] = Array.isArray(value) ? value.join(",") : (value ?? "");
			}
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(chunk as Buffer);
			const body = chunks.length ? Buffer.concat(chunks) : undefined;
			const req = new Request(`http://x${url.pathname}${url.search}`, {
				method,
				headers,
				body: method === "GET" || method === "HEAD" ? undefined : body,
			});
			const res =
				pathname.startsWith("/api/work/") || pathname.startsWith("/api/public/")
					? await work.handler(req)
					: await http.handler(req);
			const resHeaders: Record<string, string> = {};
			res.headers.forEach((value, key) => {
				resHeaders[key] = value;
			});
			response.writeHead(res.status, resHeaders);
			const buffer = Buffer.from(await res.arrayBuffer());
			response.end(buffer);
		})().catch((error) => {
			response.statusCode = 500;
			response.end(String(error));
		});
	});
	await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
	const address = server.address();
	const bound =
		typeof address === "object" && address !== null ? address.port : port;
	return {
		port: bound,
		close: async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await http.dispose();
			await work.dispose();
		},
	};
}
