// STL-15 §3: Better Auth stays at its existing base path (/api/auth/*).
// This wrapper forwards only the enabled, specified routes to the real
// handler and normalizes every error to the §3 union envelope; SQL and
// secret-bearing Better Auth errors never leak.

const ALLOWED = new Set<string>([
	"POST /api/auth/sign-in/email",
	"GET /api/auth/get-session",
	"POST /api/auth/sign-out",
]);



export interface AuthLike {
	handler:
		| ((request: Request) => Promise<Response>)
		| Promise<(request: Request) => Promise<Response>>
		| { fetch: (request: Request) => Promise<Response> };
}

export function makeAuthHandler(
	auth: AuthLike,
	// D5 (review c3): production derives CORS from AuthConfig.publicOrigin —
	// cookie credentials only for configured origins, never a test URL.
	origin = "http://127.0.0.1:3000",
) {
	const corsHeaders: Record<string, string> = {
		"access-control-allow-origin": origin,
		"access-control-allow-credentials": "true",
		"cache-control": "no-store",
	};
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const route = `${request.method} ${url.pathname}`;
		// Unauthenticated preflights must pass for cookie credentials; other
		// disallowed routes are 404 (§3: unsupported paths fail closed).
		if (request.method === "OPTIONS")
			return new Response(null, {
				status: 204,
				headers: {
					...corsHeaders,
					"access-control-allow-methods": "GET,POST,PATCH,DELETE",
					"access-control-allow-headers": "content-type,x-api-key",
				},
			});
		if (!ALLOWED.has(route))
			return Response.json(
				{ _tag: "NotFound" },
				{ status: 404, headers: corsHeaders },
			);
		try {
			const handler = await auth.handler;
			const response = await (typeof handler === "function"
				? handler
				: handler.fetch.bind(handler))(request);
			const headers = new Headers(response.headers);
			for (const [key, value] of Object.entries(corsHeaders))
				headers.set(key, value);
			return new Response(response.body, {
				status: response.status,
				headers,
			});
		} catch {
			// Sanitized 503 only — no stderr diagnostics (ADR 0010); the tracing
			// layer around the handler records the failure span instead.
			return Response.json(
				{ _tag: "Unavailable" },
				{ status: 503, headers: corsHeaders },
			);
		}
	};
}
