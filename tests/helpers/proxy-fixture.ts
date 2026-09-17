import type { Server } from "node:http";

/**
 * STL-25 S08/S09: a disposable HTTP/1.1 reverse proxy - the buffering oracle.
 *
 * `flush` mode forwards bytes as they arrive (a transparent proxy): SSE frames
 * must traverse it live. `buffer` mode accumulates the entire upstream response
 * body before forwarding anything - the Cloudflare/Nginx buffering pathology
 * the stock client's short-connection detector exists for.
 *
 * Generic over the target: tests point it at any origin (test server, a
 * conn-capped probe); nothing here knows shape table names.
 */

export interface ProxiedRequest {
	/** URL pathname + query the client asked for. */
	url: string;
	/** Accept header the client sent (SSE mode sends text/event-stream). */
	accept: string;
}

export interface ProxyFixture {
	/** Proxy origin (http://127.0.0.1:PORT) clients connect to. */
	url: string;
	/** Number of in-flight proxied requests (conn-ceiling diagnostics). */
	inFlight(): number;
	peakInFlight(): number;
	/** Every proxied request, in order (transport-mode forensics). */
	requests(): ProxiedRequest[];
	close(): Promise<void>;
}

export function startProxy(
	upstreamOrigin: string,
	options: { mode: "buffer" | "flush" },
): ProxyFixture {
	let inFlight = 0;
	let peak = 0;
	const seen: ProxiedRequest[] = [];
	const upstream = new URL(upstreamOrigin);
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 120,
		fetch: async (request) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			seen.push({
				url: new URL(request.url).search,
				accept: request.headers.get("accept") ?? "",
			});
			try {
				const target = new URL(request.url);
				target.host = upstream.host;
				const response = await fetch(target.toString(), {
					method: request.method,
					headers: request.headers,
					body: request.body,
					signal: request.signal,
				});
				if (options.mode === "flush") {
					// Transparent: forward the body stream as it arrives, headers
					// immediately - SSE frames traverse live.
					return new Response(response.body, {
						status: response.status,
						headers: response.headers,
					});
				}
				// Buffer: whole-body accumulation before the first forwarded
				// byte - the buffering signature the fallback detects.
				const body = await response.arrayBuffer();
				return new Response(body, {
					status: response.status,
					headers: response.headers,
				});
			} finally {
				inFlight--;
			}
		},
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		inFlight: () => inFlight,
		peakInFlight: () => peak,
		requests: () => seen.slice(),
		close: () => {
			server.stop(true);
			return Promise.resolve();
		},
	};
}
